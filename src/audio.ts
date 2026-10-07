/**
 * Audio, with the device-variance class of bug designed out.
 *
 * AR-2/AR-3: the POC played either a bundled sprite or the OS speech engine,
 * and the sprite set was empty, so playback depended on the device having a
 * Chinese voice. Root cause, measured: docs/SPEC.md 11.4. The fix is that the
 * Hanzi is ALWAYS a pre-rendered clip, and a missing clip degrades silently
 * (AR-4) rather than falling back to a voice the device may not have.
 *
 * Clips live in public/audio/<word-id>.mp3 with an index at
 * public/audio/manifest.json, written by the offline TTS batch job. When the
 * manifest is absent, speech is simply off: no 404 storm, no console noise.
 */

export interface AudioEngine {
  /** Must be called from a user gesture before any WebAudio use (AR-5). */
  unlock(): void;
  setMuted(muted: boolean): void;
  /** Pronounces the Hanzi of a word. Never throws, never blocks play. */
  speak(wordId: string): void;
  /** Replays the current target's pronunciation (FR-16). */
  replay(wordId: string): void;
  /** Correct/wrong cue; the ding rises with the combo (SPEC 1.7). */
  feedback(correct: boolean, combo: number): void;
  /** How many clips the manifest advertises; 0 means speech is off. */
  clipCount(): number;
  loadManifest(): Promise<number>;
}

const DING_BASE_HZ = 620;
const BUZZ_HZ = 150;

export interface AudioOptions {
  /** Directory holding the clips. Defaults to the app's base URL. */
  readonly baseUrl?: string;
  readonly muted?: boolean;
  /** Injectable for tests. */
  readonly fetchImpl?: typeof fetch;
}

export function createAudio(options: AudioOptions = {}): AudioEngine {
  const base = options.baseUrl ?? `${import.meta.env.BASE_URL}audio/`;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let muted = options.muted ?? false;
  let context: AudioContext | null = null;
  let clips: Set<string> | null = null;
  let manifestRequest: Promise<number> | null = null;
  let active: HTMLAudioElement | null = null;

  const ensureContext = (): AudioContext | null => {
    if (muted) return null;
    if (context) return context;
    try {
      const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch {
      return null;
    }
    return context;
  };

  const tone = (frequency: number, durationMs: number, type: OscillatorType, gain: number): void => {
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      const oscillator = ctx.createOscillator();
      const volume = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      volume.gain.value = gain;
      oscillator.connect(volume);
      volume.connect(ctx.destination);
      const now = ctx.currentTime;
      volume.gain.setValueAtTime(gain, now);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      oscillator.start(now);
      oscillator.stop(now + durationMs / 1000);
    } catch {
      // A cue that cannot play is not a reason to break a round (AR-4).
    }
  };

  const playClip = (wordId: string): void => {
    if (muted) return;
    if (clips !== null && !clips.has(wordId)) return;
    try {
      active?.pause();
      const element = new Audio(`${base}${encodeURIComponent(wordId)}.mp3`);
      element.preload = 'auto';
      active = element;
      void element.play().catch(() => {
        // Autoplay refusal or a missing clip: silent, per AR-4/AR-5.
      });
    } catch {
      // ignore
    }
  };

  return {
    unlock() {
      const ctx = ensureContext();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    },
    setMuted(next: boolean) {
      muted = next;
      if (muted) {
        active?.pause();
        active = null;
      }
    },
    speak(wordId: string) {
      playClip(wordId);
    },
    replay(wordId: string) {
      playClip(wordId);
    },
    feedback(correct: boolean, combo: number) {
      if (muted) return;
      if (correct) {
        const step = Math.min(Math.max(combo, 0), 12);
        tone(DING_BASE_HZ * 2 ** (step / 12), 180, 'sine', 0.16);
      } else {
        tone(BUZZ_HZ, 220, 'square', 0.1);
      }
    },
    clipCount() {
      return clips?.size ?? 0;
    },
    async loadManifest() {
      if (manifestRequest) return manifestRequest;
      manifestRequest = (async () => {
        try {
          const response = await fetchImpl(`${base}manifest.json`);
          if (!response.ok) {
            clips = new Set();
            return 0;
          }
          const body = (await response.json()) as { clips?: string[] };
          clips = new Set(body.clips ?? []);
          return clips.size;
        } catch {
          clips = new Set();
          return 0;
        }
      })();
      return manifestRequest;
    },
  };
}