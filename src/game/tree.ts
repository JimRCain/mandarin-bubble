/**
 * Progression: the tech tree the Decks screen draws.
 *
 * Rarity is no longer a choice the player makes. It used to be a Settings
 * toggle (Common / Mid / Rare), which meant a first-day player could put
 * themselves in front of 886 rare words and lose. Jim, 2026-11-01: the band
 * stays in the data, but the *player* advances through it by mastering what
 * they have, and the UI never mentions it again.
 *
 * So this module answers three questions, and nothing else:
 *
 *  - which decks are open right now (unlocks);
 *  - what each world is worth as a percentage (bars on the tree);
 *  - which band a deck is allowed to draw from (the rarity ramp).
 *
 * It is pure: a deck list plus the stored progress in, plain numbers out. No
 * React, no storage, so the rules are unit-testable and the screens stay dumb.
 */

import { REVIEW } from './config';
import { masteryOf } from './review';
import type { WordProgress } from './review';
import { BANDS, type Band, type DeckMeta, type Word } from './types';

/**
 * Mastery is counted in WORDS, not in boxes.
 *
 * A deck counts toward an unlock when this fraction of its own words is known
 * or mid-learning. Words the player has met but not mastered still count,
 * because a player grinding a 30-word deck should see the next one open on
 * effort rather than only on perfect retention.
 */
export const UNLOCK_KNOWN_FRACTION = 0.6;

/**
 * The HSK ladder unlocks on its own rung, not on the world tree: rung N opens
 * once rung N-1 is 60% mastered. HSK 1 is open from the start (it is the
 * first-run default deck).
 */
export const LADDER_GROUP = 'HSK';

/** Decks open before the player has answered a single word. */
export const STARTER_DECKS: readonly string[] = ['hsk-1', 'colors', 'numbers-1-20'];

/**
 * The order decks open in. Groups run easiest-first and the decks inside a
 * group follow `order` from the index, so this is a reading list, not a
 * ranking of importance.
 *
 * A group's list is ordered by how reachable its decks are: the words that
 * show up in the most everyday sentences go first (colors, numbers, family
 * before sports, health). HSK is held out of the world tree and climbed as a
 * ladder, so it does not appear here.
 */
export const WORLD_ORDER: readonly string[] = [
  'Nouns',
  'Verbs & Routines',
  'Adjectives & Emotions',
  'Time, Weather, Nature',
  'Grammar & Function Words',
  'Characters',
  'Social & Travel',
];

/** How many decks in a group are open at once before the next group opens. */
export const DECKS_OPEN_PER_GROUP = 2;

/** A world opens once this many decks across the whole tree are mastered. */
export const DECKS_MASTERED_TO_OPEN_WORLD = 2;

export interface WordProgressMap {
  readonly [wordId: string]: WordProgress | undefined;
}

/** One deck inside a group. */
export interface TreeNode {
  readonly deck: DeckMeta;
  readonly unlocked: boolean;
  /** Words answered at least once. */
  readonly seen: number;
  /** Words at or above REVIEW.knownBox. */
  readonly known: number;
  /** known / uniqueWords, 0..1. */
  readonly progress: number;
  readonly complete: boolean;
}

/** One collapsible group: a world, or the HSK ladder. */
export interface TreeGroup {
  readonly name: string;
  readonly icon: string;
  /** Only groups with a count here can be drawn as a ladder rung. */
  readonly ladder: boolean;
  readonly nodes: readonly TreeNode[];
  readonly open: number;
  readonly total: number;
  /** Sum of known words across the group. */
  readonly known: number;
  readonly words: number;
  readonly progress: number;
}

const GROUP_ICONS: Record<string, string> = {
  Characters: '📐',
  Nouns: '🏠',
  'Verbs & Routines': '🏃',
  'Adjectives & Emotions': '💛',
  'Time, Weather, Nature': '🌤️',
  'Grammar & Function Words': '🔗',
  'Social & Travel': '✈️',
  HSK: '🎓',
};

export function groupIcon(group: string): string {
  return GROUP_ICONS[group] ?? '📦';
}

/**
 * How many of a deck's words the player knows, given the loaded words for it.
 *
 * Decks are loaded lazily, so a screen may not have every deck's word list.
 * When it does not, the caller passes what it has and the count is honest
 * about it: no words means no progress, not "unknown and therefore done".
 */
export function deckTally(
  words: readonly Word[],
  progress: WordProgressMap,
): { seen: number; known: number } {
  let seen = 0;
  let known = 0;
  for (const word of words) {
    const record = progress[word.id];
    if (!record || record.seen === 0) continue;
    seen += 1;
    if (masteryOf(record) === 'known') known += 1;
  }
  return { seen, known };
}

/**
 * A deck is mastered when UNLOCK_KNOWN_FRACTION of its words are known.
 *
 * `known` here is the mastery count, deliberately: the unlock is a statement
 * about retention, and letting a half-seen word open the next deck would let a
 * player rush through the tree without ever consolidating.
 */
export function isMastered(tally: { known: number; seen: number }, deck: DeckMeta): boolean {
  if (deck.uniqueWords === 0) return false;
  return tally.known / deck.uniqueWords >= UNLOCK_KNOWN_FRACTION;
}

/**
 * The whole tree, given every deck and the player's progress.
 *
 * `wordsOf` returns the words the caller has loaded for a deck; returning an
 * empty list is how a screen says "not loaded yet", and the deck then shows no
 * progress rather than a fabricated one.
 */
export function buildTree(
  decks: readonly DeckMeta[],
  progress: WordProgressMap,
  wordsOf: (deckId: string) => readonly Word[],
): TreeGroup[] {
  const byGroup = new Map<string, DeckMeta[]>();
  for (const deck of decks) {
    const list = byGroup.get(deck.group) ?? [];
    list.push(deck);
    byGroup.set(deck.group, list);
  }

  const masteredCount = (deck: DeckMeta): boolean =>
    isMastered(deckTally(wordsOf(deck.id), progress), deck);

  const worldsMastered = decks
    .filter((deck) => !WORLD_ORDER.includes(deck.group) || deck.group !== LADDER_GROUP)
    .filter(masteredCount).length;

  const tree: TreeGroup[] = [];

  for (const name of WORLD_ORDER) {
    const groupDecks = (byGroup.get(name) ?? []).slice().sort((a, b) => a.order - b.order);
    if (groupDecks.length === 0) continue;

    // Worlds open one at a time: the first is always open, each later world
    // needs a couple of finished decks behind it. This is what stops a new
    // player staring at 50 identical rows.
    const worldIndex = WORLD_ORDER.indexOf(name);
    const groupOpen = worldIndex === 0 || worldsMastered >= worldIndex * DECKS_MASTERED_TO_OPEN_WORLD;

    // Walk the list in order with a cursor: start with the group's starter
    // decks, then hand out one more each time the previous deck is mastered.
    // A cursor is the whole rule, and it cannot drift out of sync the way a
    // second "how many are open" counter did.
    let cursor = groupOpen ? groupDecks.filter((deck) => STARTER_DECKS.includes(deck.id)).length : 0;
    // A group may have no starter deck declared; open its first deck then.
    if (groupOpen && cursor === 0 && groupDecks.length > 0) cursor = 1;

    const nodes: TreeNode[] = [];
    for (let index = 0; index < groupDecks.length; index += 1) {
      const deck = groupDecks[index]!;
      const words = wordsOf(deck.id);
      const tally = deckTally(words, progress);
      const progressRatio = deck.uniqueWords === 0 ? 0 : tally.known / deck.uniqueWords;
      const unlocked = groupOpen && index < cursor;

      // Opening the door behind you: once this deck is mastered, the next one
      // joins the open set. Only ever moves forward.
      if (unlocked && masteredCount(deck) && cursor === index + 1) cursor = index + 2;

      nodes.push({
        deck,
        unlocked,
        seen: tally.seen,
        known: tally.known,
        progress: progressRatio,
        complete: deck.uniqueWords > 0 && progressRatio >= 1,
      });
    }

    tree.push(summarise(name, false, nodes));
  }

  // The ladder: rung N opens when rung N-1 is mastered. HSK 1 is always open.
  const ladderDecks = (byGroup.get(LADDER_GROUP) ?? []).slice().sort((a, b) => a.order - b.order);
  if (ladderDecks.length > 0) {
    const ladderNodes: TreeNode[] = ladderDecks.map((deck, index) => {
      const words = wordsOf(deck.id);
      const tally = deckTally(words, progress);
      const previous = ladderDecks[index - 1];
      const unlocked = index === 0 || (previous !== undefined && masteredCount(previous));
      return {
        deck,
        unlocked,
        seen: tally.seen,
        known: tally.known,
        progress: deck.uniqueWords === 0 ? 0 : tally.known / deck.uniqueWords,
        complete: deck.uniqueWords > 0 && tally.known / deck.uniqueWords >= 1,
      };
    });
    tree.push(summarise(LADDER_GROUP, true, ladderNodes));
  }

  return tree;
}

function summarise(name: string, ladder: boolean, nodes: readonly TreeNode[]): TreeGroup {
  const known = nodes.reduce((sum, node) => sum + node.known, 0);
  const words = nodes.reduce((sum, node) => sum + node.deck.uniqueWords, 0);
  return {
    name,
    icon: groupIcon(name),
    ladder,
    nodes,
    open: nodes.filter((node) => node.unlocked).length,
    total: nodes.length,
    known,
    words,
    progress: words === 0 ? 0 : known / words,
  };
}

/** Deck ids the player may currently play. */
export function unlockedDeckIds(tree: readonly TreeGroup[]): string[] {
  return tree.flatMap((group) => group.nodes.filter((node) => node.unlocked).map((node) => node.deck.id));
}

/**
 * The rarer bands stop being a button and become a ramp.
 *
 * A deck draws from `common` first. Once the player knows 40% of the deck,
 * `mid` joins it; at 70%, `rare`. The numbers live here rather than in
 * Settings because they are a property of the progression, not of a session,
 * and a player who re-rolled them could wreck their own difficulty curve.
 */
export const BAND_RAMP: readonly { band: Band; at: number }[] = [
  { band: 'common', at: 0 },
  { band: 'mid', at: 0.4 },
  { band: 'rare', at: 0.7 },
];

/**
 * Bands a deck may currently draw from, given how far the player has got
 * through it. Always non-empty: `common` is at 0, so even a fresh deck gets it.
 *
 * A deck with no common words at all (Colors is 24 rare / 6 mid / 0 common)
 * would otherwise be unplayable, so the ramp falls back to every band the deck
 * actually has.
 */
export function bandsForDeck(deck: DeckMeta, progressRatio: number, available: readonly Band[] = BANDS): Band[] {
  const present = available.filter((band) => (deck.bands[band] ?? 0) > 0);
  const ramp = BAND_RAMP.filter((step) => progressRatio >= step.at)
    .map((step) => step.band)
    .filter((band) => present.includes(band));
  return ramp.length > 0 ? ramp : present;
}

/**
 * The band ramp across a whole session pool: a word is playable if its own
 * deck has reached the band it belongs to.
 *
 * This is the function the game loop uses instead of the old Settings bands.
 * It takes the pool (each word knows which decks it came from) and the
 * per-deck ratios, and returns the words that are allowed to appear.
 */
export function filterByRamp(
  words: readonly { band: Band; decks: readonly string[] }[],
  ratioOf: (deckId: string) => number,
  bandsOf: (deckId: string, ratio: number) => readonly Band[],
): number[] {
  const kept: number[] = [];
  words.forEach((word, index) => {
    const allowed = word.decks.some((deckId) => bandsOf(deckId, ratioOf(deckId)).includes(word.band));
    if (allowed) kept.push(index);
  });
  return kept;
}

/** Guard against a stored settings object from before the ramp existed. */
export function isLadderDeck(deck: DeckMeta): boolean {
  return deck.group === LADDER_GROUP;
}

/** Boxes left before a word counts as known; used by the Progress screen. */
export function boxesToKnown(box: number): number {
  return Math.max(0, REVIEW.knownBox - box);
}