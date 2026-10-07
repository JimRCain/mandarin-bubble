import { describe, expect, it, vi } from 'vitest';
import {
  SCHEMA_VERSION,
  createStorage,
  emptyProgress,
  hasSeenHowTo,
  loadProgress,
  loadSession,
  loadSettings,
  markHowToSeen,
  saveProgress,
  saveSession,
  saveSettings,
} from '../src/store/persistence';
import { DEFAULT_SETTINGS } from '../src/game/types';

/** Minimal in-memory Storage, good enough to exercise the wrapper. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

/** A Storage that throws on write, like Safari private mode. */
function hostileStorage(): Storage {
  const backing = memoryStorage();
  return {
    ...backing,
    get length() {
      return backing.length;
    },
    setItem: () => {
      throw new DOMException('QuotaExceededError');
    },
  } as Storage;
}

describe('storage wrapper (FR-23)', () => {
  it('uses a working Storage', () => {
    const storage = createStorage(memoryStorage());
    expect(storage.available).toBe(true);
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');
    storage.remove('k');
    expect(storage.get('k')).toBeNull();
  });

  it('keeps playing when the browser refuses to store anything', () => {
    const storage = createStorage(hostileStorage());
    expect(storage.available).toBe(false);
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');
  });
});

describe('progress (FR-21)', () => {
  it('round-trips words, bests and the schema version', () => {
    const storage = createStorage(memoryStorage());
    const store = {
      ...emptyProgress(),
      words: { '马-ma3': { box: 2, dueAt: 1234, seen: 3, correct: 3, lapses: 0, lastSeenAt: 100 } },
      best: { fastestMs: 640, longestCombo: 11 },
    };
    saveProgress(storage, store);

    const loaded = loadProgress(storage);
    expect(loaded.version).toBe(SCHEMA_VERSION);
    expect(loaded.words['马-ma3']?.box).toBe(2);
    expect(loaded.best.fastestMs).toBe(640);
    expect(loaded.best.longestCombo).toBe(11);
    expect(loaded.updatedAt).not.toBeNull();
  });

  it('discards a progress file from another schema version rather than half-reading it', () => {
    const storage = createStorage(memoryStorage());
    storage.set('mb.progress.v1', JSON.stringify({ version: 99, words: { a: {} }, best: {} }));
    expect(loadProgress(storage)).toEqual(emptyProgress());
  });

  it('throws away unparseable JSON instead of crashing the app', () => {
    const storage = createStorage(memoryStorage());
    storage.set('mb.progress.v1', '{ this is not json');
    expect(loadProgress(storage)).toEqual(emptyProgress());
    expect(storage.get('mb.progress.v1')).toBeNull();
  });

  it('tolerates an old progress file that is missing fields', () => {
    const storage = createStorage(memoryStorage());
    storage.set('mb.progress.v1', JSON.stringify({ version: SCHEMA_VERSION }));
    const loaded = loadProgress(storage);
    expect(loaded.words).toEqual({});
    expect(loaded.best).toEqual({ fastestMs: null, longestCombo: 0 });
  });
});

describe('settings and session', () => {
  it('falls back to defaults when settings are missing or malformed', () => {
    const storage = createStorage(memoryStorage());
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.set('mb.settings.v1', JSON.stringify({ pace: 'rush' }));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings', () => {
    const storage = createStorage(memoryStorage());
    const settings = { ...DEFAULT_SETTINGS, decks: ['hsk-1', 'food'], pace: 'rush' as const, pinyin: true };
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('turns pinyin on for settings saved before it became the default', () => {
    const storage = createStorage(memoryStorage());
    // Exactly what an older build wrote: no version marker, pinyin off because
    // that used to be the default.
    storage.set(
      'mb.settings.v1',
      JSON.stringify({ decks: ['hsk-1'], bands: ['common'], pace: 'normal', pinyin: false, sound: true }),
    );
    expect(loadSettings(storage).pinyin).toBe(true);
  });

  it('still honours a pinyin toggle that was set after the change', () => {
    const storage = createStorage(memoryStorage());
    saveSettings(storage, { ...DEFAULT_SETTINGS, pinyin: false });
    expect(loadSettings(storage).pinyin).toBe(false);
  });

  it('resumes an in-flight session (FR-22) and ignores one from another version', () => {
    const storage = createStorage(memoryStorage());
    saveSession(storage, { state: { phase: 'playing' }, queue: ['a', 'b'] });
    const loaded = loadSession(storage);
    expect(loaded?.queue).toEqual(['a', 'b']);
    expect(loaded?.version).toBe(SCHEMA_VERSION);

    storage.set('mb.session.v1', JSON.stringify({ version: 0, queue: [] }));
    expect(loadSession(storage)).toBeNull();
  });

  it('remembers that the how-to card was seen, so it is shown once (FR-6)', () => {
    const storage = createStorage(memoryStorage());
    const spy = vi.fn();
    expect(hasSeenHowTo(storage)).toBe(false);
    markHowToSeen(storage, true);
    spy();
    expect(hasSeenHowTo(storage)).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });
});