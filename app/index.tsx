/**
 * Level select. Twelve levels, unlocked in order, grouped by machine class so
 * the climb up the hierarchy is visible before you play it.
 */

import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hierarchyRow, MACHINE_CLASS } from '../src/engine/formal';
import { LEVELS, isUnlocked } from '../src/engine/levels';
import type { Level, MachineKind } from '../src/engine/types';
import { useGame } from '../src/store/game';
import { Card, Label } from '../src/ui/components/Controls';
import { elevation, RADIUS, SPACE, TAP, TYPE, type Palette } from '../src/ui/theme';
import { usePalette } from '../src/ui/usePalette';

const GROUPS: { kind: MachineKind; caption: string }[] = [
  { kind: 'DFA', caption: 'Regular languages, one state per fact' },
  { kind: 'NFA', caption: 'Same power, fewer states, empty moves' },
  { kind: 'PDA', caption: 'Context free, one unbounded stack' },
  { kind: 'TM', caption: 'A tape you can read and write anywhere' },
];

export default function LevelSelect() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const solved = useGame((s) => s.progress.solved);
  const shown = useGame((s) => s.progress.shownSolution);

  const done = useMemo(() => new Set(solved), [solved]);
  const revealed = useMemo(() => new Set(shown), [shown]);

  return (
    <ScrollView
      style={{ backgroundColor: palette.ground }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + SPACE.lg, paddingBottom: insets.bottom + SPACE.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ ...TYPE.display, color: palette.ink }}>Automata Lab</Text>
      <Text style={{ ...TYPE.body, color: palette.muted, marginTop: SPACE.xs }}>
        Draw a machine. Watch it run. Read it as a tuple.
      </Text>
      <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.sm }}>
        {done.size} of {LEVELS.length} solved
      </Text>

      {GROUPS.map((group) => {
        const levels = LEVELS.filter((l) => l.type === group.kind);
        return (
          <View key={group.kind} style={styles.group}>
            <View style={styles.groupHead}>
              <Label text={MACHINE_CLASS[group.kind].name} palette={palette} />
              <Text style={{ ...TYPE.small, color: palette.muted, marginTop: 2 }}>
                {group.caption}
              </Text>
            </View>
            {levels.map((level) => (
              <LevelRow
                key={level.id}
                level={level}
                palette={palette}
                locked={!isUnlocked(level, solved)}
                solved={done.has(level.id)}
                shown={revealed.has(level.id)}
                onPress={() => router.push(`/level/${level.id}`)}
              />
            ))}
          </View>
        );
      })}

      <Card palette={palette} style={styles.footer}>
        <Label text="The hierarchy" palette={palette} />
        <View style={{ height: SPACE.sm }} />
        {[3, 2, 1, 0].map((t) => {
          const row = hierarchyRow(t as 0 | 1 | 2 | 3);
          return (
            <View key={row.type} style={styles.hierarchyRow}>
              <Text style={{ ...TYPE.monoSmall, color: palette.accentInk, width: 46 }}>
                type {row.type}
              </Text>
              <Text style={{ ...TYPE.small, color: palette.ink, flex: 1 }}>
                {row.name}, {row.machine.toLowerCase()}
              </Text>
              <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>{row.example}</Text>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

function LevelRow({
  level,
  palette,
  locked,
  solved,
  shown,
  onPress,
}: {
  level: Level;
  palette: Palette;
  locked: boolean;
  solved: boolean;
  shown: boolean;
  onPress: () => void;
}) {
  const status = locked ? 'Locked' : solved ? (shown ? 'Solved, shown' : 'Solved') : 'Open';

  return (
    <Pressable
      testID={`level-${level.id}`}
      disabled={locked}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      accessibilityLabel={`Level ${level.index}, ${level.title}. ${level.goal} ${status}.`}
      style={[
        styles.row,
        {
          backgroundColor: palette.surface,
          borderColor: solved ? palette.pass : palette.hairline,
          opacity: locked ? 0.45 : 1,
        },
        elevation(1, palette),
      ]}
    >
      <View
        style={[
          styles.index,
          {
            backgroundColor: solved ? palette.passTint : palette.surfaceSunken,
          },
        ]}
      >
        <Text
          style={{
            ...TYPE.monoSmall,
            fontWeight: '700',
            color: solved ? palette.pass : palette.muted,
          }}
        >
          {level.index}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={{ ...TYPE.bodyStrong, color: palette.ink }}>{level.title}</Text>
        <Text numberOfLines={2} style={{ ...TYPE.small, color: palette.muted, marginTop: 1 }}>
          {level.goal}
        </Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>par {level.par}</Text>
        {locked ? (
          <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>locked</Text>
        ) : solved ? (
          <Text style={{ ...TYPE.monoSmall, color: palette.pass }}>{shown ? 'shown' : 'done'}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: SPACE.lg,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  group: {
    marginTop: SPACE.xl,
    gap: SPACE.sm,
  },
  groupHead: {
    marginBottom: SPACE.xs,
  },
  row: {
    minHeight: TAP + 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACE.md,
    gap: SPACE.md,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  index: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  footer: {
    marginTop: SPACE.xxl,
    padding: SPACE.lg,
  },
  hierarchyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    minHeight: 24,
  },
});
