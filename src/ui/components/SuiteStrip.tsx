/**
 * The suite, graded continuously.
 *
 * There is no Run button. Every edit re-grades after a short pause and the
 * strip recolours; tapping a test drives its trace over the diagram already on
 * screen. While the machine is not yet well formed the strip stays neutral
 * rather than shouting red at a half-drawn machine.
 */

import { memo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SuiteResult } from '../../engine/simulate';
import { EPSILON } from '../../engine/types';
import { RADIUS, SPACE, TYPE, type Palette } from '../theme';

export interface SuiteStripProps {
  palette: Palette;
  suite: SuiteResult | null;
  /** True while the machine is not well formed, so verdicts are withheld. */
  neutral: boolean;
  neutralReason?: string;
  selected: string | null;
  onSelect: (input: string) => void;
  solved: boolean;
}

const show = (w: string): string => (w === '' ? EPSILON : w);

export const SuiteStrip = memo(function SuiteStrip(props: SuiteStripProps) {
  const { palette, suite, neutral, neutralReason, selected, onSelect, solved } = props;

  const status = solved
    ? { text: 'ALL PASSING', color: palette.pass }
    : neutral || !suite
      ? { text: (neutralReason ?? 'WAITING').toUpperCase(), color: palette.muted }
      : {
          text: `${suite.total - suite.passed} FAILING`,
          color: suite.passed === suite.total ? palette.pass : palette.fail,
        };

  return (
    <View
      testID="suite-strip"
      style={[styles.wrap, { borderTopColor: palette.hairline }]}
      accessibilityLabel={
        suite && !neutral
          ? `Suite, ${suite.passed} of ${suite.total} passing`
          : 'Suite waiting for a well formed machine'
      }
    >
      <View style={styles.head}>
        <Text style={{ ...TYPE.label, color: palette.muted }}>SUITE · LIVE</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ ...TYPE.label, color: status.color }}>{status.text}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pills}
      >
        {(suite?.rows ?? []).map((row) => {
          const isSelected = selected === row.input;
          const tone = neutral
            ? { fg: palette.muted, bg: 'transparent', border: palette.hairline }
            : row.pass
              ? { fg: palette.pass, bg: palette.passTint, border: palette.passTint }
              : { fg: palette.fail, bg: palette.failTint, border: palette.fail };
          return (
            <Pressable
              key={row.input || 'empty'}
              testID={`test-${row.input || 'empty'}`}
              accessibilityRole="button"
              accessibilityLabel={
                neutral
                  ? `Test ${show(row.input)}`
                  : `Test ${show(row.input)}, ${row.pass ? 'passing' : 'failing'}. ${
                      row.expected ? 'The language accepts it' : 'The language rejects it'
                    }.`
              }
              accessibilityHint="Steps this run over the diagram"
              onPress={() => onSelect(row.input)}
              style={[
                styles.pill,
                {
                  backgroundColor: tone.bg,
                  borderColor: isSelected ? palette.accent : tone.border,
                  borderWidth: isSelected ? 1.6 : 1,
                },
              ]}
            >
              <Text style={{ ...TYPE.monoSmall, color: tone.fg }}>{show(row.input)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.sm,
  },
  pills: {
    flexDirection: 'row',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.lg,
  },
  pill: {
    minWidth: 34,
    minHeight: 30,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
});
