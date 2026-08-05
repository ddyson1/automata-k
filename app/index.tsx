/**
 * Level select.
 *
 * One document: twelve levels grouped by machine class, divided by hairlines
 * rather than boxed into cards, so the climb up the hierarchy is legible
 * before you play it.
 */

import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hierarchyRow, MACHINE_CLASS } from '../src/engine/formal';
import { LEVELS, isUnlocked } from '../src/engine/levels';
import type { Level, MachineKind } from '../src/engine/types';
import { useGame } from '../src/store/game';
import { SPACE, TAP, TYPE, type Palette } from '../src/ui/theme';
import { usePalette } from '../src/ui/usePalette';

const GROUPS: { kind: MachineKind; caption: string }[] = [
  { kind: 'DFA', caption: 'One state per fact worth remembering' },
  { kind: 'NFA', caption: 'Same power, fewer states, empty moves' },
  { kind: 'PDA', caption: 'One unbounded stack, last in first out' },
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
        { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ ...TYPE.label, color: palette.muted }}>FORMAL LANGUAGE THEORY</Text>
      <Text style={{ ...TYPE.display, color: palette.ink, marginTop: SPACE.sm, fontSize: 32 }}>
        Automata Lab
      </Text>
      <Text style={{ ...TYPE.body, color: palette.muted, marginTop: SPACE.xs }}>
        Draw a machine. Watch it run. Read it as a tuple.
      </Text>
      <Text style={{ ...TYPE.monoSmall, color: palette.muted, marginTop: SPACE.md }}>
        {done.size} of {LEVELS.length} solved
      </Text>

      {GROUPS.map((group) => {
        const levels = LEVELS.filter((l) => l.type === group.kind);
        return (
          <View key={group.kind} style={styles.group}>
            <View style={[styles.groupHead, { borderTopColor: palette.rule }]}>
              <Text style={{ ...TYPE.label, color: palette.accentInk }}>
                {MACHINE_CLASS[group.kind].name.toUpperCase()}
              </Text>
              <Text style={{ ...TYPE.small, color: palette.muted, marginTop: 3 }}>
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

      <View style={[styles.group, styles.hierarchy, { borderTopColor: palette.rule }]}>
        <Text style={{ ...TYPE.label, color: palette.muted }}>THE HIERARCHY</Text>
        <View style={{ height: SPACE.md }} />
        {[3, 2, 1, 0].map((t) => {
          const row = hierarchyRow(t as 0 | 1 | 2 | 3);
          return (
            <View key={row.type} style={styles.hierarchyRow}>
              <Text style={{ ...TYPE.monoSmall, color: palette.accentInk, width: 52 }}>
                type {row.type}
              </Text>
              <Text style={{ ...TYPE.small, color: palette.ink, flex: 1 }}>
                {row.name}, {row.machine.toLowerCase()}
              </Text>
              <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>{row.example}</Text>
            </View>
          );
        })}
      </View>
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
      style={[styles.row, { borderTopColor: palette.hairline, opacity: locked ? 0.4 : 1 }]}
    >
      <Text
        style={{
          ...TYPE.monoSmall,
          color: solved ? palette.pass : palette.muted,
          width: 22,
          paddingTop: 3,
        }}
      >
        {level.index}
      </Text>
      <View style={styles.rowBody}>
        <Text style={{ ...TYPE.title, fontSize: 17, color: palette.ink }}>{level.title}</Text>
        <Text numberOfLines={2} style={{ ...TYPE.small, color: palette.muted, marginTop: 1 }}>
          {level.goal}
        </Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>par {level.par}</Text>
        {locked ? (
          <Text style={{ ...TYPE.label, color: palette.muted }}>LOCKED</Text>
        ) : solved ? (
          <Text style={{ ...TYPE.label, color: palette.pass }}>{shown ? 'SHOWN' : 'DONE'}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: SPACE.xl,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  group: {
    marginTop: SPACE.xxl,
  },
  groupHead: {
    borderTopWidth: 1,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.md,
  },
  row: {
    minHeight: TAP + 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACE.md,
    gap: SPACE.md,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  rowBody: { flex: 1 },
  rowMeta: { alignItems: 'flex-end', gap: 3, paddingTop: 3 },
  hierarchy: { borderTopWidth: 1, paddingTop: SPACE.lg },
  hierarchyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    minHeight: 26,
  },
});
