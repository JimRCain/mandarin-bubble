/**
 * Background music, deliberately temporary (Jim, 2026-10-12): the two fastest
 * full songs from `music/songs` (132 bpm each) are pre-rendered OGGs under
 * `public/audio/music/`, and this module starts one per session. It is a
 * placeholder for the adaptive MIDI score in docs/SPEC.md 5.2, so it stays a
 * plain <audio> loop with no mixing, no crossfade and no per-difficulty stems.
 *
 * Two rules are inherited from audio.ts, for the same reasons:
 *  - a clip that cannot play is silent, never fatal (AR-4), so a missing OGG or
 *    a refused autoplay must not make a session fail
 *  - playback only begins inside a user gesture (AR-5), which is why startSession
 *    calls unlock() before play()
 *
 * Nothing here is load-bearing: with the files absent, the game plays exactly as
 * it did before.
 */

/**
 * The two fastest songs in the set. `firefly-lane` is 宫 gong 132 bpm and
 * `spice-road` is 徵 zhi 132 bpm (music/CURATION.md), so a session opens on one
 * of them and the next session opens on the other.
 */
export const TRACKS = ['firefly-lane', 'spice-road'] as const;

export type Track = (typeof TRACKS)[number];

/** The track for a session counter: 0 → firefly-lane, 1 → spice-road, … */
export function nextTrack(index: number): Track {
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  return TRACKS[Math.abs(safe) % TRACKS.length] ?? TRACKS[0];
}

export interface MusicEngine {
  /**
   * Must be called from a user gesture before the browser will accept playback
   * (AR-5). An <audio> element needs nothing resumed, so this documents the
   * contract rather than doing work.
   */
  unlock(): void;
  /** Off when the player turns Sound off; turns the current track back on. */
  setMuted(muted: boolean): void;
  /** Starts (or switches to) a track, looping. Never throws, never blocks play. */
  play(trackId: string): void;
  /** Ends the session's music: pauses and forgets the track. */
  stop(): void;
  /** The track this engine is on, or null before the first play and after stop. */
  currentTrack(): string | null;
}

export interface MusicOptions {
  /** Directory holding the tracks. Defaults to the app's base URL plus `audio/`. */
  readonly baseUrl?: string;
  readonly muted?: boolean;
  /** Injectable so tests never construct a real Audio element. */
  readonly createElement?: () => HTMLAudioElement;
}

/** Quiet enough to sit under the Hanzi clips, which are the point. */
const VOLUME = 0.35;

export function createMusic(options: MusicOptions = {}): MusicEngine {
  const base = options.baseUrl ?? `${import.meta.env.BASE_URL}audio/`;
  const makeElement = options.createElement ?? (() => new Audio());
  let muted = options.muted ?? false;
  let track: string | null = null;
  let element: HTMLAudioElement | null = null;
  /** The src currently loaded, tracked separately: a real element resolves src
   * to an absolute URL, so comparing against it would re-load on every call. */
  let loadedSrc: string | null = null;

  const kick = (): void => {
    if (!element) return;
    try {
      const started: unknown = element.play();
      if (started instanceof Promise) void started.catch(() => {});
    } catch {
      // Autoplay refusal or a codec the browser will not play: silent (AR-4/AR-5).
    }
  };

  const playTrack = (trackId: string): void => {
    // Remembered even while muted, so turning Sound back on mid-session starts
    // the track that was chosen rather than nothing.
    track = trackId;
    if (muted) return;
    try {
      if (!element) {
        element = makeElement();
        element.loop = true;
        element.preload = 'auto';
        element.volume = VOLUME;
      }
      const src = `${base}music/${encodeURIComponent(trackId)}.ogg`;
      if (loadedSrc !== src) {
        element.src = src;
        loadedSrc = src;
      }
      kick();
    } catch {
      // A player that cannot be built is a session without music, not an error.
      element = null;
      loadedSrc = null;
    }
  };

  const pause = (): void => {
    if (!element) return;
    try {
      element.pause();
    } catch {
      // A pause that fails is not a failure worth surfacing.
    }
  };

  return {
    unlock() {
      // Intentionally empty: the gesture that calls this is what makes the later
      // play() acceptable, and an <audio> element has no context to resume.
    },
    setMuted(next: boolean) {
      muted = next;
      if (muted) pause();
      else if (track !== null) playTrack(track);
    },
    play(trackId: string) {
      playTrack(trackId);
    },
    stop() {
      pause();
      track = null;
    },
    currentTrack() {
      return track;
    },
  };
}