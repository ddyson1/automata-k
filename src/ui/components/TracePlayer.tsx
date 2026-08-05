/**
 * Step through one run. Floats inside the canvas card, so the canvas itself
 * never resizes or reflows.
 */

import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BLANK, type Frame, type Level, type RunResult } from '../../engine/types';
import { elevation, RADIUS, SPACE, TYPE, type Palette } from '../theme';
import { Button } from './Controls';

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
  const last = result.frames.length - 1;
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
    }, 520);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, index, last, onIndex, onTogglePlay]);

  const verdict =
    result.outcome === 'accept'
      ? { text: 'accepted', fg: palette.pass, bg: palette.passTint }
      : result.outcome === 'nonhalting'
        ? { text: 'did not halt', fg: palette.fail, bg: palette.failTint }
        : result.outcome === 'error'
          ? { text: 'not a valid machine', fg: palette.fail, bg: palette.failTint }
          : { text: 'rejected', fg: palette.fail, bg: palette.failTint };

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: palette.surface, borderColor: palette.hairline },
        elevation(2, palette),
      ]}
      accessibilityLabel={`Trace of ${input === '' ? 'the empty string' : input}, step ${
        index + 1
      } of ${result.frames.length}, ${verdict.text}`}
    >
      <View style={styles.headRow}>
        <Text style={{ ...TYPE.label, color: palette.muted }}>TRACE</Text>
        <View style={[styles.pill, { backgroundColor: verdict.bg }]}>
          <Text style={{ ...TYPE.small, color: verdict.fg, fontWeight: '700' }}>
            {verdict.text}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>
          {index + 1}/{result.frames.length}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
        <View style={styles.cells}>
          {input.length === 0 ? (
            <Text style={{ ...TYPE.mono, color: palette.muted }}>ε (empty input)</Text>
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
                      backgroundColor: here
                        ? palette.accentTintStrong
                        : read
                          ? palette.surfaceSunken
                          : palette.surface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      ...TYPE.mono,
                      color: read && !here ? palette.muted : palette.ink,
                    }}
                  >
                    {ch}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {level.type === 'PDA' && frame?.stack ? (
        <View style={styles.auxRow}>
          <Text style={{ ...TYPE.label, color: palette.muted, marginRight: SPACE.sm }}>STACK</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.cells}>
              {frame.stack.length === 0 ? (
                <Text style={{ ...TYPE.mono, color: palette.muted }}>empty</Text>
              ) : (
                // Top of the stack first, which is how a player reads it.
                [...frame.stack].reverse().map((sym, i) => (
                  <View
                    key={i}
                    style={[
                      styles.cell,
                      {
                        borderColor: i === 0 ? palette.accent : palette.hairline,
                        backgroundColor: i === 0 ? palette.accentTint : palette.surface,
                      },
                    ]}
                  >
                    <Text style={{ ...TYPE.mono, color: palette.ink }}>{sym}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {level.type === 'TM' && frame?.tape ? (
        <View style={styles.auxRow}>
          <Text style={{ ...TYPE.label, color: palette.muted, marginRight: SPACE.sm }}>TAPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.cells}>
              {frame.tape.map((sym, i) => {
                const here = i === frame.head;
                return (
                  <View
                    key={i}
                    style={[
                      styles.cell,
                      {
                        borderColor: here ? palette.accent : palette.hairline,
                        backgroundColor: here ? palette.accentTintStrong : palette.surface,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        ...TYPE.mono,
                        color: sym === BLANK ? palette.muted : palette.ink,
                      }}
                    >
                      {sym}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {result.note ? (
        <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.xs }}>
          {result.note}
        </Text>
      ) : null}

      <View style={styles.controls}>
        <Button
          label="Back"
          palette={palette}
          compact
          grow
          disabled={index === 0}
          onPress={() => onIndex(Math.max(0, index - 1))}
        />
        <Button
          label={playing ? 'Pause' : 'Play'}
          palette={palette}
          tone="accent"
          compact
          grow
          disabled={last === 0}
          onPress={onTogglePlay}
        />
        <Button
          label="Next"
          palette={palette}
          compact
          grow
          disabled={index >= last}
          onPress={() => onIndex(Math.min(last, index + 1))}
        />
        <Button label="Close" palette={palette} tone="quiet" compact onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: SPACE.sm,
    right: SPACE.sm,
    bottom: SPACE.sm,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACE.md,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.sm,
  },
  pill: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  strip: {
    flexGrow: 0,
  },
  cells: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    minHeight: 30,
  },
  cell: {
    minWidth: 26,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  auxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACE.sm,
  },
  controls: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.md,
  },
});
