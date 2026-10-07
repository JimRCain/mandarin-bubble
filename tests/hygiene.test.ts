/**
 * Source hygiene: the game layer must be deterministic and side-effect free.
 *
 * NFR-3 and the POC's defect list both come down to this: a game whose randomness
 * or clock cannot be injected cannot be tested, and a timer that keeps running
 * while a card is up is how "untimed teaching" silently becomes timed. So the
 * only places allowed to read the real clock or real randomness are the app
 * shell, the board wrapper and persistence.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = new URL('../src', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

/** Files allowed to touch real time or real randomness, with the reason. */
const ALLOWED: Record<string, string> = {
  'src/store/persistence.ts': 'timestamps stored with a save',
  'src/game/rng.ts': 'the single place a real clock is defined',
};

const PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'Math.random()', regex: /Math\.random\s*\(/ },
  { name: 'Date.now()', regex: /Date\.now\s*\(/ },
  { name: 'performance.now()', regex: /performance\.now\s*\(/ },
  { name: 'new Date()', regex: /new Date\s*\(/ },
];

describe('determinism hygiene (NFR-3, NFR-9)', () => {
  /**
   * Scan code, not prose: prose is where these rules are *described*, so a
   * naive grep flags the very comments that document the invariant
   * ("nothing here may call Date.now()"). The `[^:]` guard keeps `https://`
   * inside a string from being treated as a comment.
   */
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('keeps real clocks and randomness out of the game layer', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(join(SRC, '..'), file);
      if (ALLOWED[rel] !== undefined) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const { name, regex } of PATTERNS) {
        if (regex.test(source)) offenders.push(`${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not let the frame loop live inside React state', () => {
    // The engine must not be React-state driven per frame, or taps land on stale
    // positions (SPEC 7). React components may not call step() themselves.
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(join(SRC, '..'), file);
      if (!rel.startsWith('src/components')) continue;
      const source = readFileSync(file, 'utf8');
      if (/\.step\s*\(/.test(source) && !/requestAnimationFrame/.test(source)) {
        offenders.push(`${rel}: step() outside a rAF-driven component`);
      }
    }
    expect(offenders).toEqual([]);
  });
});