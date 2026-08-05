/**
 * Step through one run, in place.
 *
 * Not an overlay and not a sheet: a band between the diagram and the ledger,
 * so the states lighting up above it are the same states you were just
 * editing.
 */

import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BLANK, EPSILON, type Frame, type Level, type RunResult } from '../../engine/types';
import { RADIUS, SPACE, TYPE, type Palette } from '../theme';

export interface TracePlayerProps {
  level: Level;
  input: string;
  result: RunResult;
  index: number;
  playing: boolean;
  onIndex: (i: number) => void;
  onTogglePlay: () => void;
  onClose: () => void;
  palette: Palette;
}

export function TracePlayer(props: TracePlayerProps) {
  const { level, input, result, index, playing, onIndex, onTogglePlay, onClose, palette } = props;
  const frame = result.frames[index] as Frame | undefined;
  const last = Math.max(0, result.frames.length - 1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setInterval(() => {
      onIndex(Math.min(last, index + 1));
      if (index + 1 >= last) onTogglePlay();
    }, 500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, index, last, onIndex, onTogglePlay]);

  const verdict =
    result.outcome === 'accept'
      ? { text: 'ACCEPTED', color: palette.pass }
      : result.outcome === 'nonhalting'
        ? { text: 'DID NOT HALT', color: palette.fail }
        : result.outcome === 'error'
          ? { text: 'NOT A MACHINE', color: palette.fail }
          : { text: 'REJECTED', color: palette.fail };

  return (
    <View
      testID="trace-band"
      style={[styles.wrap, { borderTopColor: palette.hairline, backgroundColor: palette.surfaceSunken }]}
      accessibilityLabel={`Trace of ${input === '' ? 'the empty string' : input}, step ${
        index + 1
      } of ${result.frames.length}, ${verdict.text.toLowerCase()}`}
    >
      <View style={styles.head}>
        <Text style={{ ...TYPE.label, color: palette.muted }}>TRACE</Text>
        <Text style={{ ...TYPE.label, color: verdict.color }}>{verdict.text}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>
          {index + 1}/{result.frames.length}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cells}>
        {input.length === 0 ? (
          <Text style={{ ...TYPE.mono, color: palette.muted }}>{EPSILON} empty input</Text>
        ) : (
          [...input].map((ch, i) => {
            const read = frame ? i < frame.pos : false;
            const here = frame ? i === frame.pos : false;
            return (
              <View
                key={i}
                style={[
                  styles.cell,
                  {
                    borderColor: here ? palette.accent : palette.hairline,
                    backgroundColor: here ? palette.accentTintStrong : 'transparent',
                  },
                ]}
              >
                <Text style={{ ...TYPE.mono, color: read && !here ? palette.muted : palette.ink }}>
                  {ch}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {level.type === 'PDA' && frame?.stack ? (
        <Aux label="STACK" palette={palette}>
          {frame.stack.length === 0
            ? [
                <Text key="e" style={{ ...TYPE.mono, color: palette.muted }}>
                  empty
                </Text>,
              ]
            : [...frame.stack].reverse().map((sym, i) => (
                <View
                  key={i}
                  style={[
                    styles.cell,
                    {
                      borderColor: i === 0 ? palette.accent : palette.hairline,
                      backgroundColor: i === 0 ? palette.accentTint : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ ...TYPE.mono, color: palette.ink }}>{sym}</Text>
                </View>
              ))}
        </Aux>
      ) : null}

      {level.type === 'TM' && frame?.tape ? (
        <Aux label="TAPE" palette={palette}>
          {frame.tape.map((sym, i) => {
            const here = i === frame.head;
            return (
              <View
                key={i}
                style={[
                  styles.cell,
                  {
                    borderColor: here ? palette.accent : palette.hairline,
                    backgroundColor: here ? palette.accentTintStrong : 'transparent',
                  },
                ]}
              >
                <Text style={{ ...TYPE.mono, color: sym === BLANK ? palette.muted : palette.ink }}>
                  {sym}
                </Text>
              </View>
            );
          })}
        </Aux>
      ) : null}

      {result.note ? (
        <Text style={[styles.note, { color: palette.muted }]}>{result.note}</Text>
      ) : null}

      <View style={styles.controls}>
        <Step label="Back" palette={palette} disabled={index === 0} onPress={() => onIndex(Math.max(0, index - 1))} />
        <Step
          label={playing ? 'Pause' : 'Play'}
          palette={palette}
          strong
          disabled={last === 0}
          onPress={onTogglePlay}
        />
        <Step label="Next" palette={palette} disabled={index >= last} onPress={() => onIndex(Math.min(last, index + 1))} />
        <View style={{ flex: 1 }} />
        <Step label="Close" palette={palette} onPress={onClose} />
      </View>
    </View>
  );
}

function Aux({
  label,
  palette,
  children,
}: {
  label: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.auxRow}>
      <Text style={{ ...TYPE.label, color: palette.muted, width: 42 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cells}>
        {children}
      </ScrollView>
    </View>
  );
}

function Step({
  label,
  palette,
  onPress,
  disabled,
  strong,
}: {
  label: string;
  palette: Palette;
  onPress: () => void;
  disabled?: boolean;
  strong?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.step, { opacity: disabled ? 0.35 : 1 }]}
    >
      <Text
        style={{
          ...TYPE.small,
          fontWeight: strong ? '700' : '500',
          color: strong ? palette.accentInk : palette.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACE.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.sm,
  },
  cells: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    minHeight: 28,
  },
  cell: {
    minWidth: 25,
    height: 26,
    borderRadius: RADIUS.chip,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  auxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACE.sm,
    paddingLeft: SPACE.lg,
  },
  note: {
    ...TYPE.small,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
  },
  step: {
    minHeight: 34,
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
});
