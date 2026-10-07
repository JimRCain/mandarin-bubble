/**
 * The runtime edge of the app: one session, one reducer, one clock.
 *
 * Everything under src/game/ is pure: no clock, no randomness, no DOM. This file
 * is where that meets a browser. Real time is read in exactly one place, to pick
 * a seed when the URL does not supply one, so ?seed=123 makes a session exactly
 * repeatable and the golden e2e test can rely on it. Frame deltas are handed in
 * by GameBoard.tsx from requestAnimationFrame.
 *
 * There is exactly ONE hook instance per app: this provider. Screens call
 * useGame() and none of them may create their own, because the POC's defect 9 was
 * a score that looked right while two copies of the session existed and only one
 * of them was being updated (SPEC 2.3).
 *
 * Session transitions are applied in the callbacks below rather than in effects,
 * so a score can never be swallowed by a queued updater, and storage is written
 * on discrete events instead of five times a second.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createAudio, type AudioEngine } from './audio';
import { buildPool, loadDeck, loadIndex, starterDeck } from './content';
import { DEFAULT_BOARD, type BoardConfig } from './game/board';
import { SESSION } from './game/config';
import { createRng, systemClock, type Rng } from './game/rng';
import { afterCorrect, afterWrong } from './game/review';
import { filterPool, planRound } from './game/selection';
import {
  initialSession,
  remainingMs,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from './game/scoring';
import {
  PACE_SPECS,
  type ContentIndex,
  type PoolWord,
  type SessionSettings,
} from './game/types';
import {
  clearSession,
  createStorage,
  hasSeenHowTo,
  loadProgress,
  loadSettings,
  markHowToSeen,
  saveProgress,
  saveSession,
  saveSettings,
  type ProgressStore,
  type StorageLike,
} from './store/persistence';

/**
 * The clock moves in discrete steps so the reducer sees five ticks a second
 * instead of sixty. A session can therefore end up to 200ms late, which is
 * invisible across 90 seconds, and React re-renders 5x/s instead of 60x/s while
 * the bubbles themselves move smoothly (they are DOM, not state).
 */
const CLOCK_STEP_MS = 200;

export interface GameApi {
  readonly state: SessionState;
  readonly settings: SessionSettings;
  readonly index: ContentIndex | null;
  readonly pool: readonly PoolWord[];
  readonly boardConfig: BoardConfig;
  readonly audio: AudioEngine;
  readonly progress: ProgressStore;
  readonly loading: boolean;
  readonly error: string | null;
  readonly seed: number;
  /**
   * Bumped on every startSession. App.tsx uses it, with the pace, as the key of
   * the play screen, so the board engine is rebuilt for each session instead of
   * being patched up in an effect.
   */
  readonly sessionEpoch: number;
  readonly howToSeen: boolean;
  word(id: string | null): PoolWord | null;
  advance(dtMs: number): void;
  answer(wordId: string): void;
  acknowledgeExposure(): void;
  endSession(): void;
  updateSettings(patch: Partial<SessionSettings>): void;
  toggleDeck(deckId: string): void;
  startSession(): void;
  setHowToSeen(seen: boolean): void;
}

const GameContext = createContext<GameApi | null>(null);

/** Prefer ?seed=NNN (repeatable sessions); fall back to the real clock once. */
function readSeed(): number {
  const search = typeof globalThis.location === 'undefined' ? '' : globalThis.location.search;
  const raw = new URLSearchParams(search).get('seed');
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed >>> 0 : systemClock.now() >>> 0;
}

/** Board geometry for a pace: fall speed and bubble count live there, not in Band. */
export function boardConfigFor(pace: SessionSettings['pace']): BoardConfig {
  const spec = PACE_SPECS[pace];
  return {
    ...DEFAULT_BOARD,
    bubbleCount: spec.bubbleCount,
    speed: spec.speed,
    // PaceSpec.stagger is SECONDS between spawns; BoardConfig.stagger is a
    // vertical gap as a fraction of board height. Converting with the pace's own
    // speed is what keeps the entry cascade about a second long: passed through
    // raw, a 0.35 s offset lands as 0.35 of the board and the field spends
    // twenty seconds empty while the player stares at nothing.
    stagger: spec.speed * spec.stagger,
  };
}

export function GameProvider({
  children,
  storage: injectedStorage,
}: {
  children: ReactNode;
  storage?: StorageLike;
}) {
  const storage = useMemo(() => injectedStorage ?? createStorage(), [injectedStorage]);
  const seed = useMemo(() => readSeed(), []);
  // The planning stream. Reseeded on every startSession so that one seed deals
  // one session (NFR-3), however many sessions the player has already played.
  const rng = useRef<Rng>(createRng(seed));

  const [settings, setSettings] = useState<SessionSettings>(() => loadSettings(storage));
  const [progress, setProgress] = useState<ProgressStore>(() => loadProgress(storage));
  const [state, setState] = useState<SessionState>(initialSession);
  const [index, setIndex] = useState<ContentIndex | null>(null);
  // The pool and its load state are one piece of state: `loaded` remembers which
  // deck selection the words belong to, so `pool` and `loading` are derived from
  // it rather than tracked alongside it (a parallel flag is how a stale pool ends
  // up paired with a brand new selection).
  const [loaded, setLoaded] = useState<{
    decks: readonly string[];
    words: readonly PoolWord[];
  } | null>(null);
  const decksKey = settings.decks.join('|');
  const loadedKey = loaded ? loaded.decks.join('|') : null;
  const pool = useMemo<readonly PoolWord[]>(
    // Memoised so an unloaded pool keeps one identity across renders: it is a
    // dependency of the round planner and of the derived stats.
    () => (loaded && loadedKey === decksKey ? loaded.words : []),
    [loaded, loadedKey, decksKey],
  );
  const loading = loadedKey !== decksKey;
  const [error, setError] = useState<string | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [howToSeen, setHowToSeenState] = useState(() => hasSeenHowTo(storage));

  const audio = useMemo(() => createAudio(), []);
  const boardConfig = useMemo(() => boardConfigFor(settings.pace), [settings.pace]);

  // The reducer is pure, so the very next state can be computed from the current
  // one without waiting for a render. That is what lets an answer, a score and
  // the storage write stay one step (SPEC 2.3, defect 9).
  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  const pendingMs = useRef(0);
  const taughtIds = useRef(new Set<string>());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ---- content ------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    loadIndex()
      .then((loaded) => {
        if (cancelled) return;
        setIndex(loaded);
        // A first run has no saved decks; pick the starter deck the corpus marks.
        // Chained here rather than in its own effect so nothing re-renders twice.
        if (loadSettings(storage).decks.length === 0) {
          const starter = starterDeck(loaded);
          if (starter) setSettings((prev) => ({ ...prev, decks: [starter.id] }));
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Could not load the word index.');
      });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    const deckIds = settings.decks;
    let cancelled = false;
    // Decks load as one batch when the selection changes. There is no `loading`
    // flag to set in this body: loading and the pool are *derived* from `loaded`
    // below, which also removes the stale-flag race a parallel flag would create
    // when the selection changes mid-load.
    const batch =
      deckIds.length === 0
        ? Promise.resolve([] as { deckId: string; words: readonly PoolWord[] }[])
        : Promise.all(deckIds.map(async (deckId) => ({ deckId, words: await loadDeck(deckId) })));
    batch
      .then((entries) => {
        if (cancelled) return;
        setLoaded({ decks: deckIds, words: buildPool(entries) });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Could not load a deck.');
      });
    return () => {
      cancelled = true;
    };
  }, [settings.decks]);

  useEffect(() => {
    saveSettings(storage, settings);
  }, [storage, settings]);

  const byId = useMemo(() => {
    const map = new Map<string, PoolWord>();
    for (const entry of pool) map.set(entry.id, entry);
    return map;
  }, [pool]);

  const word = useCallback(
    (id: string | null) => (id === null ? null : (byId.get(id) ?? null)),
    [byId],
  );

  // ---- session ------------------------------------------------------------

  /** Writes down a finished session: it is over, and the record may improve. */
  const endOfSession = useCallback(
    (finished: SessionState) => {
      clearSession(storage);
      const now = systemClock.now();
      setProgress((prev) => {
        const fastest =
          finished.fastestMs === null
            ? prev.best.fastestMs
            : prev.best.fastestMs === null
              ? finished.fastestMs
              : Math.min(prev.best.fastestMs, finished.fastestMs);
        const updated: ProgressStore = {
          ...prev,
          best: {
            fastestMs: fastest,
            longestCombo: Math.max(prev.best.longestCombo, finished.longestCombo),
          },
          updatedAt: now,
        };
        saveProgress(storage, updated);
        return updated;
      });
    },
    [storage],
  );

  /**
   * The single way a session moves. Discrete events are also where the session is
   * mirrored to storage, so a reload mid-session resumes instead of forgetting
   * (FR-21..23) without a localStorage write per frame.
   */
  const apply = useCallback(
    (action: SessionAction): SessionState => {
      const next = sessionReducer(stateRef.current, action);
      stateRef.current = next;
      setState(next);
      const quiet = action.type === 'tick' || action.type === 'pause' || action.type === 'resume';
      if (!quiet) {
        if (next.phase === 'summary') endOfSession(next);
        else if (next.targetId !== null) saveSession(storage, { state: next, queue: [...next.askedIds] });
      }
      return next;
    },
    [endOfSession, storage],
  );

  const advance = useCallback(
    (dtMs: number) => {
      pendingMs.current += dtMs;
      if (pendingMs.current < CLOCK_STEP_MS) return;
      const ms = pendingMs.current;
      pendingMs.current = 0;
      apply({ type: 'tick', ms });
    },
    [apply],
  );

  const answer = useCallback(
    (wordId: string) => {
      const current = stateRef.current;
      if (current.phase !== 'playing' || current.targetId === null || current.paused) return;
      const correct = wordId === current.targetId;
      audio.feedback(correct, correct ? current.streak + 1 : 0);
      apply({ type: 'answer', wordId });
      // Long-term memory: a correct answer promotes the word; a wrong tap sends
      // the word that fooled the player back to box 0 (FR-18..FR-20).
      const recorded = correct ? current.targetId : wordId;
      const now = systemClock.now();
      setProgress((prev) => {
        const prior = prev.words[recorded];
        const next = correct ? afterCorrect(prior, now) : afterWrong(prior, now);
        const updated: ProgressStore = {
          ...prev,
          words: { ...prev.words, [recorded]: next },
          updatedAt: now,
        };
        saveProgress(storage, updated);
        return updated;
      });
    },
    [apply, audio, storage],
  );

  const acknowledgeExposure = useCallback(() => {
    apply({ type: 'acknowledgeExposure' });
  }, [apply]);

  const endSession = useCallback(() => {
    apply({ type: 'finish' });
  }, [apply]);

  const startSession = useCallback(() => {
    taughtIds.current = new Set();
    pendingMs.current = 0;
    clearSession(storage);
    rng.current = createRng(seed);
    const fresh: SessionState = { ...initialSession };
    stateRef.current = fresh;
    setState(fresh);
    setSessionEpoch((epoch) => epoch + 1);
    // WebAudio may only start inside a user gesture, and this is the one (AR-5).
    audio.unlock();
  }, [audio, seed, storage]);

  // Serving a round: pick a target, fill the board, teach a word if it is new.
  useEffect(() => {
    if (state.phase !== 'playing' || state.targetId !== null) return;
    const candidates = filterPool(pool, settings.decks, settings.bands);
    if (candidates.length === 0) {
      // A dead end worth naming: every deck or band is on but the filter matches
      // nothing. It cannot be derived during render because it also depends on
      // the decks having finished loading.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!loading) setError('No words match the selected decks and bands.');
      return;
    }
    const planFor = (choices: number, excludeIds: readonly string[]) =>
      planRound({
        pool: candidates,
        choices,
        excludeIds,
        rng: rng.current,
        preferDecks: settings.decks,
      });

    // Fresh targets first (FR-11); only repeat once the pool is exhausted.
    let plan = planFor(boardConfig.bubbleCount, state.askedIds);
    if (!plan) plan = planFor(Math.max(SESSION.choicesMin, 3), state.askedIds);
    if (!plan) plan = planFor(boardConfig.bubbleCount, []);
    if (!plan) {
      endSession();
      return;
    }

    const firstSight = progress.words[plan.target.id] === undefined;
    const teach = firstSight && taughtIds.current.size < SESSION.newPerSession;
    if (teach) taughtIds.current.add(plan.target.id);

    // Dealing the round is the reason this effect exists: there is no user event
    // to hang it on when the clock runs out or the target is answered.
    apply({
      type: 'round',
      targetId: plan.target.id,
      candidateIds: plan.candidateIds,
      teach,
    });
    audio.speak(plan.target.id);
  }, [
    state.phase,
    state.targetId,
    state.askedIds,
    pool,
    loading,
    settings.decks,
    settings.bands,
    boardConfig.bubbleCount,
    progress.words,
    apply,
    endSession,
    audio,
  ]);

  // A hidden tab must not eat the clock: the game pauses instead of punishing.
  useEffect(() => {
    const onVisibility = () => apply({ type: document.hidden ? 'pause' : 'resume' });
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [apply]);

  useEffect(() => {
    audio.setMuted(!settings.sound);
  }, [audio, settings.sound]);

  useEffect(() => {
    void audio.loadManifest();
  }, [audio]);

  const updateSettings = useCallback((patch: Partial<SessionSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const toggleDeck = useCallback((deckId: string) => {
    const current = settingsRef.current;
    updateSettings({
      decks: current.decks.includes(deckId)
        ? current.decks.filter((id) => id !== deckId)
        : [...current.decks, deckId],
    });
  }, [updateSettings]);

  const setHowToSeen = useCallback(
    (seen: boolean) => {
      markHowToSeen(storage, seen);
      setHowToSeenState(seen);
    },
    [storage],
  );

  // The end-to-end test drives the real app through this probe instead of
  // guessing at pixels. candidateIds is the board: GameBoard resets the engine
  // from exactly this list.
  useEffect(() => {
    const probe = {
      phase: state.phase,
      targetId: state.targetId,
      candidateIds: [...state.candidateIds],
      bubbleIds: [...state.candidateIds],
      correct: state.correct,
      wrong: state.wrong,
      score: state.score,
      streak: state.streak,
      remainingMs: remainingMs(state),
      paused: state.paused,
      seed,
    };
    (globalThis as { __mbTest?: typeof probe }).__mbTest = probe;
  }, [state, seed]);

  const value = useMemo<GameApi>(
    () => ({
      state,
      settings,
      index,
      pool,
      boardConfig,
      audio,
      progress,
      loading,
      error,
      seed,
      sessionEpoch,
      howToSeen,
      word,
      advance,
      answer,
      acknowledgeExposure,
      endSession,
      updateSettings,
      toggleDeck,
      startSession,
      setHowToSeen,
    }),
    [
      state,
      settings,
      index,
      pool,
      boardConfig,
      audio,
      progress,
      loading,
      error,
      seed,
      sessionEpoch,
      howToSeen,
      word,
      advance,
      answer,
      acknowledgeExposure,
      endSession,
      updateSettings,
      toggleDeck,
      startSession,
      setHowToSeen,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame() must be called inside <GameProvider>.');
  return value;
}