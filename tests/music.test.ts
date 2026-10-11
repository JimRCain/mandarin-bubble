import { describe, expect, it } from 'vitest';
import { createMusic, nextTrack, TRACKS } from '../src/music';

/**
 * A fake <audio> element. The unit environment is `node` (vitest.config.ts), so
 * there is no DOM: the engine's element factory is injected instead, which is
 * also the only way to observe play()/pause() without a browser.
 */
function fakeElement(options: { rejectPlay?: boolean; throwOnPlay?: boolean } = {}) {
  const state = {
    src: '',
    loop: false,
    preload: '',
    volume: 0,
    plays: 0,
    pauses: 0,
    rejectPlay: options.rejectPlay ?? false,
    throwOnPlay: options.throwOnPlay ?? false,
  };
  const element = {
    get src() {
      return state.src;
    },
    set src(next: string) {
      state.src = next;
    },
    get loop() {
      return state.loop;
    },
    set loop(next: boolean) {
      state.loop = next;
    },
    get preload() {
      return state.preload;
    },
    set preload(next: string) {
      state.preload = next;
    },
    get volume() {
      return state.volume;
    },
    set volume(next: number) {
      state.volume = next;
    },
    play: () => {
      state.plays += 1;
      if (state.throwOnPlay) throw new Error('no audio device');
      return state.rejectPlay ? Promise.reject(new Error('autoplay refused')) : Promise.resolve();
    },
    pause: () => {
      state.pauses += 1;
    },
  };
  return { element: element as unknown as HTMLAudioElement, state };
}

const BASE = 'https://example.test/audio/';

function engine(options: Parameters<typeof createMusic>[0], fake: ReturnType<typeof fakeElement>) {
  return createMusic({ baseUrl: BASE, createElement: () => fake.element, ...options });
}

describe('nextTrack', () => {
  it('alternates the two fastest songs by session index', () => {
    expect(nextTrack(0)).toBe('firefly-lane');
    expect(nextTrack(1)).toBe('spice-road');
    expect(nextTrack(2)).toBe('firefly-lane');
    expect(TRACKS).toHaveLength(2);
  });

  it('survives a nonsense index rather than returning undefined', () => {
    expect(nextTrack(-1)).toBe('spice-road');
    expect(TRACKS).toContain(nextTrack(Number.NaN));
  });
});

describe('createMusic', () => {
  it('plays the requested track from the music folder, looping', () => {
    const fake = fakeElement();
    const music = engine({}, fake);
    music.play('spice-road');

    expect(fake.state.src).toBe(`${BASE}music/spice-road.ogg`);
    expect(fake.state.loop).toBe(true);
    expect(fake.state.preload).toBe('auto');
    expect(fake.state.volume).toBeLessThan(0.5);
    expect(fake.state.plays).toBe(1);
    expect(music.currentTrack()).toBe('spice-road');
  });

  it('does not reload the element when the same track plays again', () => {
    const fake = fakeElement();
    const music = engine({}, fake);
    music.play('firefly-lane');
    music.play('firefly-lane');

    expect(fake.state.src).toBe(`${BASE}music/firefly-lane.ogg`);
    expect(fake.state.plays).toBe(2);
  });

  it('switches tracks by loading the other song', () => {
    const fake = fakeElement();
    const music = engine({}, fake);
    music.play('firefly-lane');
    music.play('spice-road');

    expect(fake.state.src).toBe(`${BASE}music/spice-road.ogg`);
    expect(music.currentTrack()).toBe('spice-road');
  });

  it('stays silent while muted, then starts the chosen track when unmuted', () => {
    const fake = fakeElement();
    const music = engine({ muted: true }, fake);
    music.play('spice-road');

    expect(fake.state.plays).toBe(0);

    music.setMuted(false);
    expect(fake.state.src).toBe(`${BASE}music/spice-road.ogg`);
    expect(fake.state.plays).toBe(1);

    music.setMuted(true);
    expect(fake.state.pauses).toBe(1);
  });

  it('forgets the track on stop, and starts a fresh one afterwards', () => {
    const fake = fakeElement();
    const music = engine({}, fake);
    music.play('firefly-lane');
    music.stop();

    expect(music.currentTrack()).toBeNull();
    expect(fake.state.pauses).toBe(1);

    music.play('spice-road');
    expect(fake.state.src).toBe(`${BASE}music/spice-road.ogg`);
  });

  it('swallows a refused autoplay', () => {
    const fake = fakeElement({ rejectPlay: true });
    const music = engine({}, fake);
    expect(() => music.play('firefly-lane')).not.toThrow();
  });

  it('survives an element that cannot even be built (AR-4)', () => {
    const music = createMusic({
      baseUrl: BASE,
      createElement: () => {
        throw new Error('no audio element here');
      },
    });
    expect(() => music.play('firefly-lane')).not.toThrow();
    expect(() => music.stop()).not.toThrow();
  });

  it('survives a play() that throws synchronously', () => {
    const fake = fakeElement({ throwOnPlay: true });
    const music = engine({}, fake);
    expect(() => music.play('firefly-lane')).not.toThrow();
  });
});