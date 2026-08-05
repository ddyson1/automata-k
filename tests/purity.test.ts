/**
 * The engine must stay importable by a plain Node script. Section 3 calls that
 * out explicitly, because it is what lets the verification suites run without a
 * simulator. This guards it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = join(import.meta.dirname, '..', 'src', 'engine');

const engineFiles = readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.ts'));

const FORBIDDEN = [
  'react',
  'react-native',
  'react-native-svg',
  'react-native-reanimated',
  'expo',
  'expo-router',
  'zustand',
  '@react-native-async-storage/async-storage',
];

describe('engine purity', () => {
  it('ships every file the layout in section 3 names', () => {
    expect(engineFiles.sort()).toEqual([
      'formal.ts',
      'levels.ts',
      'minimize.ts',
      'simulate.ts',
      'solutions.ts',
      'types.ts',
      'validate.ts',
    ]);
  });

  it.each(engineFiles)('%s imports nothing from React, React Native or Expo', (file) => {
    const source = readFileSync(join(ENGINE_DIR, file), 'utf8');
    const specifiers = [...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(
      (m) => m[1] as string,
    );
    for (const spec of specifiers) {
      const bare = spec.startsWith('.') ? null : spec.split('/')[0] as string;
      if (bare === null) continue;
      expect(FORBIDDEN, `${file} imports ${spec}`).not.toContain(bare);
    }
  });

  it.each(engineFiles)('%s uses no platform globals', (file) => {
    const source = readFileSync(join(ENGINE_DIR, file), 'utf8');
    for (const global of ['window.', 'document.', 'navigator.', 'localStorage']) {
      expect(source.includes(global), `${file} touches ${global}`).toBe(false);
    }
  });

  it('the whole engine loads and runs in a bare Node import', async () => {
    const { LEVELS } = await import('../src/engine/levels');
    const { solutionFor } = await import('../src/engine/solutions');
    const { runSuite } = await import('../src/engine/simulate');
    for (const level of LEVELS) {
      const machine = solutionFor(level.id);
      expect(machine).toBeDefined();
      expect(runSuite(machine as NonNullable<typeof machine>, level).solved).toBe(true);
    }
  });
});
