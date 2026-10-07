/**
 * Versioned local persistence (SPEC FR-21..FR-23).
 *
 * Rules that came from real bugs, not taste:
 *  - storage can be unavailable (Safari private mode throws on setItem), so
 *    every access goes through a tolerant wrapper and the game runs without it
 *  - the stored schema is versioned, and a version mismatch discards rather
 *    than half-reading: a corrupt progress file must never break the app
 *  - in-flight session state is persisted, so a mid-session reload is not a
 *    lost session
 */

import { STORAGE_KEYS } from '../game/config';
import type { WordProgress } from '../game/review';
import { DEFAULT_SETTINGS, type SessionSettings } from '../game/types';

export const SCHEMA_VERSION = 1;

export interface ProgressStore {
  readonly version: number;
  readonly words: Record<string, WordProgress>;
  readonly best: {
    readonly fastestMs: number | null;
    readonly longestCombo: number;
  };
  readonly updatedAt: number | null;
}

export interface StoredSession {
  readonly version: number;
  /** Serialised SessionState plus the round it was in, so a reload resumes it. */
  readonly state: unknown;
  readonly queue: readonly string[];
  readonly savedAt: number;
}

export interface StorageLike {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  readonly available: boolean;
}

export function emptyProgress(): ProgressStore {
  return { version: SCHEMA_VERSION, words: {}, best: { fastestMs: null, longestCombo: 0 }, updatedAt: null };
}

/**
 * Wraps a Storage, or degrades to memory when the browser refuses to give us
 * one. The game must behave identically either way; only the persistence
 * guarantee is lost.
 */
export function createStorage(backing?: Storage | null): StorageLike {
  const memory = new Map<string, string>();
  let real: Storage | null = null;

  // Read globalThis.localStorage lazily: on Safari in private mode the property
  // exists and *reads* succeed, so only a write proves it is usable. The same
  // probe runs for an injected Storage, which is how the hostile-storage test
  // exercises the fallback instead of trusting the object's shape.
  let candidate: Storage | null = null;
  if (backing === undefined) {
    try {
      candidate = globalThis.localStorage ?? null;
    } catch {
      candidate = null;
    }
  } else {
    candidate = backing;
  }

  if (candidate) {
    try {
      const probe = `${STORAGE_KEYS.settings}.probe`;
      candidate.setItem(probe, '1');
      candidate.removeItem(probe);
      real = candidate;
    } catch {
      real = null; // refuse to store: keep playing from memory only
    }
  }

  if (real) {
    return {
      available: true,
      get: (key) => {
        try {
          return real.getItem(key);
        } catch {
          return null;
        }
      },
      set: (key, value) => {
        try {
          real.setItem(key, value);
        } catch {
          memory.set(key, value);
        }
      },
      remove: (key) => {
        try {
          real.removeItem(key);
        } catch {
          memory.delete(key);
        }
      },
    };
  }

  return {
    available: false,
    get: (key) => memory.get(key) ?? null,
    set: (key, value) => {
      memory.set(key, value);
    },
    remove: (key) => {
      memory.delete(key);
    },
  };
}

function readJson<T>(storage: StorageLike, key: string): T | null {
  const raw = storage.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    storage.remove(key);
    return null;
  }
}

export function loadProgress(storage: StorageLike): ProgressStore {
  const parsed = readJson<Partial<ProgressStore>>(storage, STORAGE_KEYS.progress);
  if (!parsed || parsed.version !== SCHEMA_VERSION) return emptyProgress();
  return {
    version: SCHEMA_VERSION,
    words: parsed.words ?? {},
    best: {
      fastestMs: parsed.best?.fastestMs ?? null,
      longestCombo: parsed.best?.longestCombo ?? 0,
    },
    updatedAt: parsed.updatedAt ?? null,
  };
}

export function saveProgress(storage: StorageLike, store: ProgressStore): void {
  storage.set(STORAGE_KEYS.progress, JSON.stringify({ ...store, updatedAt: Date.now() }));
}

export function loadSettings(storage: StorageLike): SessionSettings {
  const parsed = readJson<Partial<SessionSettings>>(storage, STORAGE_KEYS.settings);
  if (!parsed || !Array.isArray(parsed.decks) || !Array.isArray(parsed.bands)) return DEFAULT_SETTINGS;
  return {
    decks: parsed.decks,
    bands: parsed.bands,
    pace: parsed.pace ?? DEFAULT_SETTINGS.pace,
    pinyin: parsed.pinyin ?? DEFAULT_SETTINGS.pinyin,
    sound: parsed.sound ?? DEFAULT_SETTINGS.sound,
  };
}

export function saveSettings(storage: StorageLike, settings: SessionSettings): void {
  storage.set(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export function loadSession(storage: StorageLike): StoredSession | null {
  const parsed = readJson<StoredSession>(storage, STORAGE_KEYS.session);
  if (!parsed || parsed.version !== SCHEMA_VERSION) return null;
  return parsed;
}

export function saveSession(storage: StorageLike, session: Omit<StoredSession, 'version' | 'savedAt'>): void {
  storage.set(
    STORAGE_KEYS.session,
    JSON.stringify({ version: SCHEMA_VERSION, savedAt: Date.now(), ...session }),
  );
}

export function clearSession(storage: StorageLike): void {
  storage.remove(STORAGE_KEYS.session);
}

export function markHowToSeen(storage: StorageLike, seen: boolean): void {
  storage.set(`${STORAGE_KEYS.settings}.howto`, seen ? 'seen' : 'unseen');
}

export function hasSeenHowTo(storage: StorageLike): boolean {
  return storage.get(`${STORAGE_KEYS.settings}.howto`) === 'seen';
}