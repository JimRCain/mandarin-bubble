import { describe, expect, it } from 'vitest';
import { createRng } from '../src/game/rng';
import {
  ambiguousTargets,
  buildPoolWords,
  chooseDistractors,
  filterPool,
  nextBubbleWord,
  planRound,
} from './helpers/pool';

describe('pool filtering (FR-9)', () => {
  it('keeps only words in the selected decks and bands', () => {
    const pool = buildPoolWords();
    const filtered = filterPool(pool, ['hsk-1'], ['common']);
    expect(filtered.length).toBeGreaterThan(10);
    for (const word of filtered) {
      expect(word.band).toBe('common');
      expect(word.decks).toContain('hsk-1');
    }
  });

  it('returns nothing for a deck that has no words in the chosen band', () => {
    const pool = buildPoolWords();
    expect(filterPool(pool, ['does-not-exist'], ['common'])).toEqual([]);
  });
});

describe('round planning (FR-10, FR-11, FR-12)', () => {
  const pool = buildPoolWords();

  it('never offers two bubbles that answer the same English gloss', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const plan = planRound({ pool, choices: 4, seed, preferDecks: ['hsk-1'] });
      expect(plan).not.toBeNull();
      if (!plan) continue;
      const glosses = plan.candidateIds.map((id) => pool.find((word) => word.id === id)?.english);
      expect(new Set(glosses).size).toBe(plan.candidateIds.length);
      const hanzi = plan.candidateIds.map((id) => pool.find((word) => word.id === id)?.hanzi);
      expect(new Set(hanzi).size).toBe(plan.candidateIds.length);
      expect(plan.candidateIds.filter((id) => id === plan.target.id)).toHaveLength(1);
    }
  });

  it('is deterministic for a given seed and varied across seeds', () => {
    const a = planRound({ pool, choices: 4, seed: 7, preferDecks: ['hsk-1'] });
    const b = planRound({ pool, choices: 4, seed: 7, preferDecks: ['hsk-1'] });
    expect(a?.target.id).toBe(b?.target.id);
    expect(a?.candidateIds).toEqual(b?.candidateIds);

    const targets = new Set<string>();
    for (let seed = 1; seed <= 25; seed += 1) {
      const plan = planRound({ pool, choices: 4, seed, preferDecks: ['hsk-1'] });
      if (plan) targets.add(plan.target.id);
    }
    expect(targets.size).toBeGreaterThan(5);
  });

  it('honours the exclusion list so a session does not repeat a target (FR-11)', () => {
    const first = planRound({ pool, choices: 4, seed: 3, preferDecks: ['hsk-1'] });
    expect(first).not.toBeNull();
    if (!first) return;
    const second = planRound({
      pool,
      choices: 4,
      seed: 3,
      preferDecks: ['hsk-1'],
      excludeIds: [first.target.id],
    });
    expect(second?.target.id).not.toBe(first.target.id);
  });

  it('returns null instead of a broken round when the pool is too small', () => {
    const tiny = buildPoolWords().filter((word) => word.decks.includes('hsk-1')).slice(0, 3);
    expect(planRound({ pool: tiny, choices: 4, seed: 1 })).toBeNull();
  });

  it('refuses targets that share a Hanzi or a gloss with another word in the pool', () => {
    const pool2 = buildPoolWords();
    const blocked = ambiguousTargets(pool2);
    expect(blocked.size).toBeGreaterThan(0);
    const plan = planRound({ pool: pool2, choices: 4, seed: 11, preferDecks: ['food'] });
    expect(plan).not.toBeNull();
    if (plan) expect(blocked.has(plan.target.id)).toBe(false);
  });

  it('prefers distractors from the same deck and band when they exist (FR-12)', () => {
    const food = pool.filter((word) => word.decks.includes('food'));
    const target = food.find((word) => word.english === 'hotpot');
    expect(target).toBeDefined();
    if (!target) return;
    const picked = chooseDistractors(target, pool, 3, createRng(5));
    expect(picked).toHaveLength(3);
    expect(picked.filter((word) => word.decks.includes('food')).length).toBeGreaterThan(0);
  });
});

/**
 * The refill rule. The board is live now, so this is the rule that keeps it
 * answerable: the new bubble may not repeat a word that is already up, and may
 * not collide with one already up either (FR-10), or two bubbles would answer
 * the same prompt.
 */
describe('nextBubbleWord', () => {
  const pool = buildPoolWords();

  /** The first pair in the corpus that would answer the same prompt. */
  const collidingPair = (() => {
    for (const a of pool) {
      const b = pool.find((word) => word.id !== a.id && (word.hanzi === a.hanzi || word.english === a.english));
      if (b) return [a, b] as const;
    }
    return null;
  })();

  it('never deals a word that is already on the board', () => {
    const boardIds = pool.slice(0, 3).map((word) => word.id);
    for (let seed = 1; seed <= 20; seed += 1) {
      const picked = nextBubbleWord({ pool, boardIds, askedIds: [], rng: createRng(seed) });
      expect(picked).not.toBeNull();
      expect(boardIds).not.toContain(picked?.id);
    }
  });

  it('never deals a word that collides with one on the board (FR-10)', () => {
    expect(collidingPair).not.toBeNull();
    if (!collidingPair) return;
    const [up, twin] = collidingPair;
    for (let seed = 1; seed <= 20; seed += 1) {
      const picked = nextBubbleWord({ pool, boardIds: [up.id], askedIds: [], rng: createRng(seed) });
      expect(picked).not.toBeNull();
      expect(picked?.id).not.toBe(twin.id);
      expect(picked?.hanzi).not.toBe(up.hanzi);
      expect(picked?.english).not.toBe(up.english);
    }
  });

  it('prefers a word this session has not asked yet (FR-11)', () => {
    const deck = pool.filter((word) => word.decks.includes('food'));
    const [boardWord] = deck;
    expect(boardWord).toBeDefined();
    if (!boardWord) return;
    const candidate = deck.find(
      (word) =>
        word.id !== boardWord.id &&
        word.hanzi !== boardWord.hanzi &&
        word.english !== boardWord.english,
    );
    expect(candidate).toBeDefined();
    if (!candidate) return;

    // Exactly one word in the whole pool is still unasked, so a refill that
    // honours FR-11 has nothing else to choose.
    const askedIds = pool.filter((word) => word.id !== candidate.id).map((word) => word.id);
    for (let seed = 1; seed <= 5; seed += 1) {
      const picked = nextBubbleWord({
        pool,
        boardIds: [boardWord.id],
        askedIds,
        rng: createRng(seed),
        preferDecks: ['food'],
      });
      expect(picked?.id).toBe(candidate.id);
    }
  });

  it('repeats a word rather than leaving a lane empty once the pool is exhausted', () => {
    const [boardWord] = pool;
    expect(boardWord).toBeDefined();
    if (!boardWord) return;
    const picked = nextBubbleWord({
      pool,
      boardIds: [boardWord.id],
      askedIds: pool.map((word) => word.id),
      rng: createRng(3),
    });
    expect(picked).not.toBeNull();
    expect(picked?.id).not.toBe(boardWord.id);
    expect(picked?.hanzi).not.toBe(boardWord.hanzi);
    expect(picked?.english).not.toBe(boardWord.english);
  });

  it('returns null when every word in the pool is already up', () => {
    const small = pool.slice(0, 2);
    const picked = nextBubbleWord({
      pool: small,
      boardIds: small.map((word) => word.id),
      askedIds: [],
      rng: createRng(1),
    });
    expect(picked).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const options = { pool, boardIds: [pool[0]?.id ?? 'x'], askedIds: [] };
    // A fresh generator each time: one shared Rng would advance between calls.
    const one = nextBubbleWord({ ...options, rng: createRng(7) });
    const two = nextBubbleWord({ ...options, rng: createRng(7) });
    expect(one?.id).toBe(two?.id);
    expect(one?.id).not.toBeNull();
  });
});