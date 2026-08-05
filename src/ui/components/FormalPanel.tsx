/**
 * The formal layer, live over the canvas.
 *
 * Shows the machine as its defining tuple and every line of δ in the notation
 * for its class, updating on every edit. Highlighting runs both ways: selecting
 * an arrow lights its δ lines, and tapping a δ line selects and centres the
 * arrow it came from.
 */

import { memo, useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { deltaSummary, machineTuple } from '../../engine/formal';
import type { Level, Machine, TransitionId } from '../../engine/types';
import { elevation, RADIUS, SPACE, TAP, TYPE, type Palette } from '../theme';
import { sectionsFor } from './AnalysisSheet';

export interface FormalPanelProps {
  level: Level;
  machine: Machine;
  palette: Palette;
  open: boolean;
  onToggle: () => void;
  /** Arrows currently selected on the canvas. */
  highlight: readonly TransitionId[];
  /** Tapping a δ line selects and centres its arrow. */
  onPickLine: (transitionIds: TransitionId[], from: string) => void;
  /** Opens the analysis sheet at one of the views this level supports. */
  onAnalyse: (section: ReturnType<typeof sectionsFor>[number]['value']) => void;
  maxHeight: number;
}

export const FormalPanel = memo(function FormalPanel(props: FormalPanelProps) {
  const { level, machine, palette, open, onToggle, highlight, onPickLine, onAnalyse, maxHeight } =
    props;

  const tuple = useMemo(() => machineTuple(machine, level), [machine, level]);
  const delta = useMemo(() => deltaSummary(machine, level), [machine, level]);
  const lit = useMemo(() => new Set(highlight), [highlight]);

  const summaryLine = `Q ${machine.states.length}  δ ${
    delta.lines.filter((l) => !l.missing).length
  }${level.type === 'DFA' && !delta.total ? `  gaps ${delta.lines.filter((l) => l.missing).length}` : ''}`;

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      style={[
        styles.panel,
        {
          backgroundColor: palette.surface,
          borderColor: palette.hairline,
          maxHeight: open ? maxHeight : TAP + 8,
        },
        elevation(2, palette),
      ]}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide the formal readout' : 'Show the formal readout'}
        accessibilityHint="The machine written as a tuple and a transition function"
        style={styles.header}
      >
        <Text style={{ ...TYPE.label, color: palette.accentInk }}>FORMAL</Text>
        <Text
          numberOfLines={1}
          style={{ ...TYPE.monoSmall, color: palette.muted, flexShrink: 1, marginLeft: SPACE.sm }}
        >
          {summaryLine}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={{ ...TYPE.small, color: palette.accent, fontWeight: '600' }}>
          {open ? 'Hide' : 'Show'}
        </Text>
      </Pressable>

      {open ? (
        <ScrollView
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {tuple.map((line) => (
                <View key={line.symbol} style={styles.tupleRow}>
                  <Text
                    selectable
                    style={{ ...TYPE.mono, color: palette.accentInk, width: 26 }}
                  >
                    {line.symbol}
                  </Text>
                  <Text selectable style={{ ...TYPE.mono, color: palette.ink }}>
                    = {line.value}
                  </Text>
                  <Text style={{ ...TYPE.monoSmall, color: palette.muted, marginLeft: SPACE.sm }}>
                    {line.gloss}
                  </Text>
                </View>
              ))}

              <View style={[styles.rule, { backgroundColor: palette.hairline }]} />

              <Text
                selectable
                style={{ ...TYPE.monoSmall, color: palette.muted, marginBottom: SPACE.xs }}
              >
                {delta.signature}
              </Text>

              {delta.lines.length === 0 ? (
                <Text style={{ ...TYPE.mono, color: palette.muted }}>
                  No rules yet. Draw an arrow.
                </Text>
              ) : null}

              {delta.lines.map((line, i) => {
                const on = line.transitionIds.some((id) => lit.has(id));
                return (
                  <Pressable
                    key={`${line.text}-${i}`}
                    onPress={() => onPickLine(line.transitionIds, line.from)}
                    disabled={line.transitionIds.length === 0}
                    accessibilityRole="button"
                    accessibilityLabel={line.text}
                    accessibilityHint={
                      line.missing ? 'This pair has no arrow' : 'Selects and centres this arrow'
                    }
                    style={[
                      styles.deltaRow,
                      on ? { backgroundColor: palette.accentTint } : null,
                    ]}
                  >
                    <Text
                      selectable
                      style={{
                        ...TYPE.mono,
                        color: line.missing ? palette.fail : on ? palette.accentInk : palette.ink,
                      }}
                    >
                      {line.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.sm }}>
            {delta.note}
          </Text>

          <View style={styles.analysisRow}>
            {sectionsFor(level).map((s) => (
              <Pressable
                key={s.value}
                onPress={() => onAnalyse(s.value)}
                accessibilityRole="button"
                accessibilityLabel={`${s.label} view of this machine`}
                style={[
                  styles.analysisChip,
                  { borderColor: palette.hairline, backgroundColor: palette.surfaceSunken },
                ]}
              >
                <Text style={{ ...TYPE.small, color: palette.accentInk, fontWeight: '600' }}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: SPACE.sm,
    right: SPACE.sm,
    top: SPACE.sm,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  body: {
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.md,
  },
  tupleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 22,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACE.sm,
  },
  analysisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xs,
    marginTop: SPACE.md,
  },
  analysisChip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  deltaRow: {
    minHeight: 24,
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: 4,
    marginHorizontal: -4,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
});
