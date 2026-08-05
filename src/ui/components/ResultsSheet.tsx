/**
 * The grader's verdict.
 *
 * Every row shows what the level's language says and what the player's machine
 * said. On failure it also shows the shortest string that distinguishes the two
 * (section 10.3). On a solve it reports minimality (section 10.1).
 */

import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { minimise } from '../../engine/minimize';
import { shortestCounterexample, type SuiteResult } from '../../engine/simulate';
import type { Level, Machine } from '../../engine/types';
import { RADIUS, SPACE, TAP, TYPE, type Palette } from '../theme';
import { Button, Divider, Label } from './Controls';
import { Sheet } from './Sheet';

export interface ResultsSheetProps {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  level: Level;
  machine: Machine;
  suite: SuiteResult | null;
  onTrace: (input: string) => void;
  onNextLevel: (() => void) | null;
  wasShown: boolean;
}

const show = (w: string): string => (w === '' ? 'ε' : w);

export function ResultsSheet(props: ResultsSheetProps) {
  const { visible, onClose, palette, level, machine, suite, onTrace, onNextLevel, wasShown } =
    props;

  const counter = useMemo(() => {
    if (!suite || suite.solved || suite.error) return null;
    return shortestCounterexample(machine, level, 7);
  }, [suite, machine, level]);

  const minimality = useMemo(() => {
    if (!suite?.solved || level.type !== 'DFA') return null;
    return minimise(machine, level.alphabet);
  }, [suite, machine, level]);

  if (!suite) return null;

  const solved = suite.solved;
  const title = suite.error
    ? 'Not a valid machine yet'
    : solved
      ? 'Solved'
      : `${suite.passed} of ${suite.total} passed`;

  const subtitle = suite.error
    ? suite.error
    : solved
      ? `${machine.states.length} ${machine.states.length === 1 ? 'state' : 'states'}, par ${level.par}${
          wasShown ? ', solution shown' : ''
        }`
      : 'Tap a row to step through that run.';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      palette={palette}
      title={title}
      subtitle={subtitle}
      testID="results-sheet"
    >
      {solved && minimality ? (
        <View
          style={[
            styles.callout,
            {
              backgroundColor: minimality.minimal ? palette.passTint : palette.accentTint,
            },
          ]}
        >
          <Text
            style={{
              ...TYPE.bodyStrong,
              color: minimality.minimal ? palette.pass : palette.accentInk,
            }}
          >
            {minimality.minimal
              ? 'This is the smallest DFA for the language.'
              : `${minimality.excess} ${
                  minimality.excess === 1 ? 'state' : 'states'
                } more than necessary.`}
          </Text>
          <Text style={{ ...TYPE.small, color: palette.muted, marginTop: 4 }}>
            {minimality.minimal
              ? `Hopcroft minimisation on your machine returns ${minimality.minimalStates} states, the same as yours.`
              : `Hopcroft minimisation returns ${minimality.minimalStates} states. ${
                  minimality.mergeable.length > 0
                    ? `These behave identically and could merge: ${minimality.mergeable
                        .map((b) => b.map((id) => label(machine, id)).join(' and '))
                        .join('; ')}.`
                    : ''
                }${
                  minimality.unreachable.length > 0
                    ? ` Unreachable: ${minimality.unreachable
                        .map((id) => label(machine, id))
                        .join(', ')}.`
                    : ''
                }`}
          </Text>
        </View>
      ) : null}

      {counter ? (
        <View style={[styles.callout, { backgroundColor: palette.failTint }]}>
          <Text style={{ ...TYPE.bodyStrong, color: palette.fail }}>
            Shortest disagreement: {show(counter.input)}
          </Text>
          <Text style={{ ...TYPE.small, color: palette.muted, marginTop: 4 }}>
            The language {counter.expected ? 'contains' : 'does not contain'} it, your machine{' '}
            {counter.actual ? 'accepts' : 'rejects'} it.
          </Text>
          <Pressable
            onPress={() => onTrace(counter.input)}
            accessibilityRole="button"
            accessibilityLabel={`Step through ${show(counter.input)}`}
            style={styles.calloutAction}
          >
            <Text style={{ ...TYPE.small, color: palette.accent, fontWeight: '700' }}>
              Step through it
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.tableHead}>
        <Label text="String" palette={palette} />
        <View style={{ flex: 1 }} />
        <Label text="Language" palette={palette} />
        <View style={{ width: SPACE.lg }} />
        <Label text="Yours" palette={palette} />
      </View>
      <Divider palette={palette} />

      {suite.rows.map((row) => (
        <Pressable
          key={row.input || 'empty'}
          onPress={() => onTrace(row.input)}
          accessibilityRole="button"
          accessibilityLabel={`${show(row.input)}, language says ${
            row.expected ? 'accept' : 'reject'
          }, your machine says ${row.actual ? 'accept' : 'reject'}, ${
            row.pass ? 'pass' : 'fail'
          }`}
          style={[styles.row, { borderBottomColor: palette.hairline }]}
        >
          <View
            style={[
              styles.marker,
              { backgroundColor: row.pass ? palette.passTint : palette.failTint },
            ]}
          >
            <Text
              style={{
                ...TYPE.small,
                fontWeight: '700',
                color: row.pass ? palette.pass : palette.fail,
              }}
            >
              {row.pass ? 'ok' : 'no'}
            </Text>
          </View>
          <Text
            selectable
            numberOfLines={1}
            style={{ ...TYPE.mono, color: palette.ink, marginLeft: SPACE.md, flexShrink: 1 }}
          >
            {show(row.input)}
          </Text>
          <View style={{ flex: 1 }} />
          <Text style={{ ...TYPE.monoSmall, color: palette.muted, width: 54, textAlign: 'right' }}>
            {row.expected ? 'accept' : 'reject'}
          </Text>
          <Text
            style={{
              ...TYPE.monoSmall,
              color: row.pass ? palette.muted : palette.fail,
              width: 54,
              textAlign: 'right',
            }}
          >
            {row.result.outcome === 'nonhalting' ? 'no halt' : row.actual ? 'accept' : 'reject'}
          </Text>
        </Pressable>
      ))}

      <View style={styles.footer}>
        {solved && onNextLevel ? (
          <Button label="Next level" palette={palette} tone="accent" grow onPress={onNextLevel} />
        ) : null}
        <Button label="Keep building" palette={palette} grow onPress={onClose} />
      </View>
    </Sheet>
  );
}

const label = (m: Machine, id: string): string =>
  m.states.find((s) => s.id === id)?.label ?? id;

const styles = StyleSheet.create({
  callout: {
    borderRadius: RADIUS.control,
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  calloutAction: {
    marginTop: SPACE.sm,
    minHeight: 28,
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: SPACE.xs,
  },
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  marker: {
    width: 34,
    height: 24,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.lg,
  },
});
