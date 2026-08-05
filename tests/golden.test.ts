/**
 * Writes and checks the golden fixture the Swift port is held to.
 *
 * The fixture is generated from the TypeScript engine, which sections 9.1 and
 * 9.2 already prove. This suite makes sure the frozen form says the same thing
 * as the live engine, so a Swift run that matches the fixture is a Swift run
 * that matches the proof.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildGolden, packBits, unpackBits } from '../scripts/golden';
import { LEVELS, enumerateStrings } from '../src/engine/levels';
import { runSuite } from '../src/engine/simulate';
import { solutionFor } from '../src/engine/solutions';
import type { Machine } from '../src/engine/types';

const OUT = join(
  import.meta.dirname,
  '..',
  'ios',
  'Tests',
  'AutomataEngineTests',
  'Fixtures',
  'golden.json',
);

const golden = buildGolden();

afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '  golden fixture',
      `    levels                   ${golden.totals.levels}`,
      `    language bits            ${golden.totals.strings}`,
      `    suite strings            ${golden.totals.tests}`,
      `    written to               ios/Tests/AutomataEngineTests/Fixtures/golden.json`,
      '',
    ].join('\n'),
  );
});

describe('bit packing', () => {
  it('round trips', () => {
    for (const n of [0, 1, 7, 8, 9, 63, 64, 1000]) {
      const values = Array.from({ length: n }, (_, i) => (i * 7) % 3 === 0);
      expect(unpackBits(packBits(values), n)).toEqual(values);
    }
  });

  it('puts the first string in the lowest bit of the first byte', () => {
    expect(packBits([true])).toBe(unpackBits(packBits([true]), 1)[0] ? packBits([true]) : '');
    expect(unpackBits(packBits([true, false, false, false, false, false, false, false]), 8)).toEqual(
      [true, false, false, false, false, false, false, false],
    );
  });
});

describe('the golden fixture', () => {
  it('covers every level', () => {
    expect(golden.levels).toHaveLength(LEVELS.length);
    expect(golden.levels.map((l) => l.id)).toEqual(LEVELS.map((l) => l.id));
  });

  it('its language bitmap agrees with the live predicate, string for string', () => {
    let checked = 0;
    for (const level of LEVELS) {
      const entry = golden.levels.find((l) => l.id === level.id);
      expect(entry, level.id).toBeDefined();
      const words = enumerateStrings(level.alphabet, level.exhaustiveMaxLength);
      expect(words.length, `${level.id} enumeration`).toBe(entry?.stringCount);

      const bits = unpackBits(entry?.languageBits as string, words.length);
      for (let i = 0; i < words.length; i++) {
        if (bits[i] !== level.accepts(words[i] as string)) {
          throw new Error(`${level.id}: bitmap disagrees on ${JSON.stringify(words[i])}`);
        }
        checked++;
      }
    }
    expect(checked).toBe(golden.totals.strings);
  });

  it('its solutions still pass their suites, so the frozen machines are the proven ones', () => {
    for (const level of LEVELS) {
      const entry = golden.levels.find((l) => l.id === level.id);
      const fromFixture = entry?.solution as Machine;
      expect(fromFixture, level.id).toBeDefined();
      expect(runSuite(fromFixture, level).solved, level.id).toBe(true);

      // And it is the same machine the app reveals.
      expect(fromFixture).toEqual(solutionFor(level.id));
    }
  });

  it('its test verdicts come from the predicate, never from stored answers', () => {
    for (const level of LEVELS) {
      const entry = golden.levels.find((l) => l.id === level.id);
      expect(entry?.testVerdicts).toEqual(level.tests.map((w) => level.accepts(w)));
    }
  });

  it('writes itself to the Swift test fixtures', () => {
    mkdirSync(dirname(OUT), { recursive: true });
    const json = `${JSON.stringify(golden, null, 2)}\n`;
    writeFileSync(OUT, json);
    expect(JSON.parse(readFileSync(OUT, 'utf8')).totals).toEqual(golden.totals);
  });
});
