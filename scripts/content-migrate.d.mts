/**
 * Types for scripts/content-migrate.mjs, which the migration tests import
 * directly. The script is plain ESM so the one-shot job has no build step; this
 * declaration is the price of keeping typechecking honest in tests.
 */

export type Band = 'common' | 'mid' | 'rare';

export interface SourceRow {
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  band: Band;
  zipf: number;
  sharedGloss?: boolean;
  sharedHanzi?: boolean;
}

export interface DeckPlan {
  id: string;
  name: string;
  group: string;
  groupOrder: number;
  order: number;
  sources: (string | undefined)[];
}

export interface MigrationReport {
  generatedBy: string;
  source: string;
  inFileDuplicatesRemoved: { file: string; id: string }[];
  expansionWordsAdded: { deck: string; id: string; note?: string }[];
  ambiguousGlosses: { deck: string; english: string; ids: string[] }[];
  sameDeckHanziPairs: { deck: string; hanzi: string; ids: string[] }[];
  zipfMismatches: unknown[];
  zeroFrequency: string[];
  splitIdsApplied: { deck: string; from: string; to: string; english: string }[];
  glossConflictsResolved: { deck: string; id: string; from: string; to: string }[];
}

export interface GoldenCounts {
  generatedBy: string;
  source: string;
  totals: {
    decks: number;
    entries: number;
    duplicateEntries: number;
    uniqueWords: number;
    bands: Record<Band, number>;
  };
  decks: {
    id: string;
    name: string;
    group: string;
    entries: number;
    uniqueWords: number;
    bands: Record<Band, number>;
    usableBands: number;
  }[];
}

export function bandFor(zipf: number): Band;
export function pinyinSlug(pinyin: string): string;
export function pickCanonicalGloss(candidates: string[]): string;
export function normalizePinyin(pinyin: string): string;
export function wordId(hanzi: string, pinyin: string): string;
export function buildDecks(): DeckPlan[];
export function migrate(): {
  categories: { id: string; name: string; group: string; order: number }[];
  files: Map<string, SourceRow[]>;
  golden: GoldenCounts;
  report: MigrationReport;
};