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
import { DEFAULT_BOARD, bubbleRadiusFor, type BoardConfig } from './game/board';
import { REVIEW, SESSION } from './game/config';
import { createRng, systemClock, type Rng } from './game/rng';
import { afterCorrect, afterWrong, isNewWord, spawnWeight } from './game/review';
import { filterPool, nextBubbleWord, planRound } from './game/selection';
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

/**
 * How often a refill tick may deal a bubble into a free lane. The POC spawned
 * every 0.8-2 s (docs/POC-MECHANICS.md item 3); the spread matters more than the
 * bounds, because an even cadence reads as a conveyor belt instead of a game.
 */
const REFILL_MS = { min: 800, max: 2000 } as const;

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

/** Board geometry for a pace: count, fall speed and spacing live there, not in Band. */
export function boardConfigFor(pace: SessionSettings['pace']): BoardConfig {
  const spec = PACE_SPECS[pace];
  return {
    ...DEFAULT_BOARD,
    bubbleCount: spec.bubbleCount,
    speed: spec.speed,
    // PaceSpec.stagger is already a vertical gap as a fraction of board height:
    // bubbles enter on screen now (docs/POC-MECHANICS.md), so it passes through.
    stagger: spec.stagger,
    // One bubble per lane, and the lane width is what decides how big a bubble
    // may be: a fixed radius overlaps as soon as the board gets busy.
    radius: bubbleRadiusFor(spec.bubbleCount),
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
  /**
   * The selector runs inside timers and callbacks that must not be recreated on
   * every answer (a refill timer restarted by each tap would never fire), so the
   * progress store is read through this ref rather than through its state value.
   * It trails the state by one effect, which is at least 800 ms ahead of any
   * refill that reads it.
   */
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const pendingMs = useRef(0);

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

  /**
   * The word a refill tick would deal: a word not already up, not colliding with
   * anything up, and not yet asked this session if such a word exists
   * (src/game/selection.ts). Returns null when the board cannot be topped up
   * without repeating something the player can already see.
   *
   * Deliberately reads stateRef rather than state so the refill timer and the
   * answer callback always see the board as it is right now, not as it was when
   * the callback was created.
   */
  const nextBubble = useCallback(() => {
    const now = systemClock.now();
    const fastMs = REVIEW.fastMs[settingsRef.current.pace];
    const words = progressRef.current.words;
    return nextBubbleWord({
      pool: filterPool(pool, settings.decks, settings.bands),
      boardIds: stateRef.current.bubbleIds,
      askedIds: stateRef.current.askedIds,
      rng: rng.current,
      preferDecks: settings.decks,
      // What the player needs decides the word, the board's fairness rules
      // decide the rest (docs/SRS-PROPOSAL.md 4.1, 4.4).
      weightOf: (word) => spawnWeight(words[word.id], now, fastMs),
      isNew: (word) => isNewWord(words[word.id]),
      newWordBudget: REVIEW.newPerBoard,
    });
  }, [pool, settings.decks, settings.bands]);

  const answer = useCallback(
    (wordId: string) => {
      const current = stateRef.current;
      if (current.phase !== 'playing' || current.targetId === null || current.paused) return;
      const correct = wordId === current.targetId;
      audio.feedback(correct, correct ? current.streak + 1 : 0);

      if (!correct) {
        // A wrong tap changes nothing about the board (the POC's rule): the
        // target stays where it is, the tapped bubble stays up.
        apply({ type: 'answer', wordId });
      } else {
        // The POC's mechanic (docs/POC-MECHANICS.md): this tap pops ONE bubble
        // and the target hops to a bubble that is still on the board. Topping the
        // board back up is the refill tick's job, not this tap's, so the only
        // spawn that belongs here is the one that stops the board emptying. That
        // corner is precisely where the POC stalled: an emptied board left its
        // target null and every later tap did nothing visible.
        const popped = current.bubbleIds.filter((id) => id !== wordId);
        const spare = popped.length === 0 ? nextBubble() : null;
        apply({
          type: 'answer',
          wordId,
          hopIndex: popped.length > 0 ? rng.current.int(popped.length) : 0,
          replacementId: spare?.id,
        });
      }
      
      // Long-term memory: a correct answer promotes the word; a wrong tap sends
      // the word that fooled the player back to box 0 (FR-18..FR-20).
      const recorded = correct ? current.targetId : wordId;
      const now = systemClock.now();
      // The clock is the grade (docs/SRS-PROPOSAL.md 4.2): roundElapsedMs is the
      // time the prompt on screen has been up, so an instant answer promotes two
      // boxes, an ordinary one promotes one, and a slow one keeps its box.
      const elapsedMs = correct ? current.roundElapsedMs : null;
      const fastMs = REVIEW.fastMs[settingsRef.current.pace];
      setProgress((prev) => {
        const prior = prev.words[recorded];
        const next = correct ? afterCorrect(prior, now, elapsedMs, fastMs) : afterWrong(prior, now);
        const updated: ProgressStore = {
          ...prev,
          words: { ...prev.words, [recorded]: next },
          updatedAt: now,
        };
        saveProgress(storage, updated);
        return updated;
      });
    },
    [apply, audio, storage, nextBubble],
  );


  const endSession = useCallback(() => {
    apply({ type: 'finish' });
  }, [apply]);

  const startSession = useCallback(() => {
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

  // Dealing the opening board: one plan fills every lane, and this is the only
  // place a whole board is ever chosen. After this the board persists, as the POC
  // did (docs/POC-MECHANICS.md): a correct tap hops the target to a bubble that is
  // already up and the refill tick tops up single lanes, so a fresh board here
  // means the session just started.
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
        // Need picks the target; the distractors keep their plausibility rules.
        weightOf: (word) =>
          spawnWeight(
            progressRef.current.words[word.id],
            systemClock.now(),
            REVIEW.fastMs[settingsRef.current.pace],
          ),
      });

    // Fresh targets first (FR-11); only repeat once the pool is exhausted.
    let plan = planFor(boardConfig.bubbleCount, state.askedIds);
    if (!plan) plan = planFor(Math.max(SESSION.choicesMin, 3), state.askedIds);
    if (!plan) plan = planFor(boardConfig.bubbleCount, []);
    if (!plan) {
      endSession();
      return;
    }

    // Dealing is the reason this effect exists: there is no user event to hang the
    // opening board on, and a session that starts with an empty board must fill it
    // before the first tap can mean anything.
    apply({
      type: 'deal',
      bubbleIds: plan.candidateIds,
      targetId: plan.target.id,
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

  /**
   * The refill tick, which is the POC's other half: a popped bubble comes back on
   * its own timer rather than as part of the tap (docs/POC-MECHANICS.md item 3),
   * so the board keeps its size without the player doing anything.
   *
   * Two things about this effect are deliberate:
   *
   *  - It does NOT depend on state.bubbleIds. A timer restarted by every board
   *    change would be reset by each answer, and with answers arriving faster
   *    than the delay it would never fire at all; it reads stateRef instead, so
   *    each fire sees the board as it is at that moment.
   *  - It reschedules itself whatever happens, including a full board or a pause.
   *    Firing into a full board is a no-op, and stopping the timer there would
   *    leave nothing to restart it when a bubble is popped.
   */
  useEffect(() => {
    if (state.phase !== 'playing') return;
    let handle: number | null = null;
    let stopped = false;

    const delay = () => REFILL_MS.min + rng.current.int(REFILL_MS.max - REFILL_MS.min + 1);

    const tick = () => {
      if (stopped) return;
      const now = stateRef.current;
      if (now.phase === 'playing' && !now.paused && now.bubbleIds.length < boardConfig.bubbleCount) {
        const next = nextBubble();
        if (next) apply({ type: 'refill', newBubbleId: next.id, capacity: boardConfig.bubbleCount });
      }
      handle = window.setTimeout(tick, delay());
    };

    handle = window.setTimeout(tick, delay());
    return () => {
      stopped = true;
      if (handle !== null) window.clearTimeout(handle);
    };
  }, [state.phase, boardConfig.bubbleCount, nextBubble, apply]);

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
  // guessing at pixels. bubbleIds is the board: GameBoard syncs the engine
  // from exactly this list.
  useEffect(() => {
    const probe = {
      phase: state.phase,
      targetId: state.targetId,
      bubbleIds: [...state.bubbleIds],
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