/**
 * Reference material for the level, in one place.
 *
 * Hint, level notes and analysis used to be three separate sheets. They are
 * sections of one now, which is the last of the six frictions the interface
 * study named. Everything else in the app is permanent; this is the one thing
 * that opens, because it is genuinely reference rather than workspace.
 */

import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  grammarLines,
  grammarTuple,
  hierarchyRow,
  machineSpeech,
  MACHINE_CLASS,
} from '../../engine/formal';
import { minimise, subsetConstruction } from '../../engine/minimize';
import { regexFor } from '../../engine/regex';
import type { Level, Machine } from '../../engine/types';
import { RADIUS, SPACE, TAP, TYPE, type Palette } from '../theme';
import { Sheet } from './Sheet';

export type LevelTab = 'level' | 'hint' | 'machine';

export interface LevelSheetProps {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  level: Level;
  machine: Machine;
  initial: LevelTab;
  alreadyShown: boolean;
  onReveal: () => void;
}

function Label({ text, palette }: { text: string; palette: Palette }) {
  return <Text style={{ ...TYPE.label, color: palette.muted }}>{text.toUpperCase()}</Text>;
}

function Mono({ text, palette }: { text: string; palette: Palette }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <Text selectable style={{ ...TYPE.mono, color: palette.ink }}>
        {text}
      </Text>
    </ScrollView>
  );
}

function Section({
  title,
  palette,
  children,
}: {
  title: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { borderTopColor: palette.hairline }]}>
      <Label text={title} palette={palette} />
      <View style={{ height: SPACE.sm }} />
      {children}
    </View>
  );
}

export function LevelSheet(props: LevelSheetProps) {
  const { visible, onClose, palette, level, machine, initial, alreadyShown, onReveal } = props;
  const [tab, setTab] = useState<LevelTab>(initial);

  // The sheet stays mounted while hidden, so pick the tab up each time it opens.
  useEffect(() => {
    if (visible) setTab(initial);
  }, [visible, initial]);

  const klass = MACHINE_CLASS[level.type];
  const row = hierarchyRow(level.chomsky);
  const drawn = machine.states.length > 0 && machine.start !== null;

  const regex = useMemo(
    () => (tab === 'machine' && drawn && level.type !== 'PDA' && level.type !== 'TM'
      ? regexFor(machine)
      : null),
    [tab, drawn, machine, level.type],
  );
  const subset = useMemo(
    () => (tab === 'machine' && drawn && level.type === 'NFA'
      ? subsetConstruction(machine, level.alphabet)
      : null),
    [tab, drawn, machine, level.alphabet, level.type],
  );
  const small = useMemo(
    () => (tab === 'machine' && drawn && level.type === 'DFA'
      ? minimise(machine, level.alphabet)
      : null),
    [tab, drawn, machine, level.alphabet, level.type],
  );

  const tabs: { value: LevelTab; label: string }[] = [
    { value: 'level', label: 'Level' },
    { value: 'hint', label: 'Hint' },
    { value: 'machine', label: 'Your machine' },
  ];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      palette={palette}
      title={level.title}
      subtitle={`Level ${level.index} · ${klass.name}`}
      testID="level-sheet"
    >
      <View style={[styles.tabs, { borderBottomColor: palette.hairline }]}>
        {tabs.map((t) => {
          const on = t.value === tab;
          return (
            <Pressable
              key={t.value}
              testID={`tab-${t.value}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              onPress={() => setTab(t.value)}
              style={[styles.tab, on ? { borderBottomColor: palette.accent } : null]}
            >
              <Text
                style={{
                  ...TYPE.small,
                  fontWeight: on ? '700' : '500',
                  color: on ? palette.accentInk : palette.muted,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'level' ? (
        <View>
          <View style={styles.first}>
            <Label text="Goal" palette={palette} />
            <View style={{ height: SPACE.sm }} />
            <Text style={{ ...TYPE.body, color: palette.ink }}>{level.goal}</Text>
          </View>

          <Section title="Language" palette={palette}>
            <Mono text={level.setBuilder} palette={palette} />
          </Section>

          <Section title="Grammar" palette={palette}>
            {grammarTuple(level.grammar).map((t) => (
              <Text key={t.symbol} selectable style={{ ...TYPE.monoSmall, color: palette.muted }}>
                {t.symbol} = {t.value}
              </Text>
            ))}
            <View style={{ height: SPACE.xs }} />
            {grammarLines(level.grammar).map((line) => (
              <Mono key={line} text={line} palette={palette} />
            ))}
            {level.grammar.note ? (
              <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.xs }}>
                {level.grammar.note}
              </Text>
            ) : null}
          </Section>

          <Section title={`Chomsky type ${row.type}`} palette={palette}>
            <Text style={{ ...TYPE.body, color: palette.ink }}>
              {row.name}. Productions of the shape {row.productions}. Recognised by a{' '}
              {row.machine.toLowerCase()}.
            </Text>
          </Section>

          <Section title={klass.name} palette={palette}>
            <Mono text={klass.definition} palette={palette} />
            <View style={{ height: SPACE.xs }} />
            <Text style={{ ...TYPE.body, color: palette.ink }}>{klass.acceptance}</Text>
            <View style={{ height: SPACE.xs }} />
            <Text style={{ ...TYPE.small, color: palette.muted }}>{klass.power}</Text>
          </Section>

          <Section title="Why this level" palette={palette}>
            <Text style={{ ...TYPE.body, color: palette.ink }}>{level.theory}</Text>
          </Section>
        </View>
      ) : null}

      {tab === 'hint' ? (
        <View>
          <View style={styles.first}>
            <Label text={`Par is ${level.par} states`} palette={palette} />
            <View style={{ height: SPACE.sm }} />
            <Text style={{ ...TYPE.body, color: palette.ink }}>{level.hint}</Text>
          </View>

          <Section title="Worked solution" palette={palette}>
            <Text style={{ ...TYPE.small, color: palette.muted }}>
              {alreadyShown
                ? 'You have already seen this. Solves on this level are marked as shown.'
                : 'This replaces whatever is on the canvas, and the solve is marked as shown.'}
            </Text>
            <Pressable
              testID="reveal-solution"
              accessibilityRole="button"
              accessibilityLabel="Show the solution"
              onPress={onReveal}
              style={[styles.action, { borderColor: palette.rule }]}
            >
              <Text style={{ ...TYPE.bodyStrong, color: palette.accentInk }}>
                Show the solution
              </Text>
            </Pressable>
          </Section>
        </View>
      ) : null}

      {tab === 'machine' ? (
        <View>
          {!drawn ? (
            <View style={styles.first}>
              <Text style={{ ...TYPE.body, color: palette.muted }}>
                Draw a machine first. There is nothing to analyse yet.
              </Text>
            </View>
          ) : null}

          {drawn && regex ? (
            <View style={styles.first}>
              <Label text="Regular expression" palette={palette} />
              <View style={{ height: SPACE.sm }} />
              <Mono text={regex} palette={palette} />
              <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.xs }}>
                By state elimination. Each state is removed in turn and the paths through it are
                folded into the edges around it.
              </Text>
            </View>
          ) : null}

          {drawn && small ? (
            <Section
              title={small.minimal ? 'Already minimal' : `${small.excess} more than necessary`}
              palette={palette}
            >
              <Mono
                text={`drawn ${small.drawnStates}${
                  small.sinkAdded ? ' plus an implicit dead state' : ''
                }   minimal ${small.minimalStates}`}
                palette={palette}
              />
              {small.mergeable.length > 0 ? (
                <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.xs }}>
                  Equivalent, so they could merge:{' '}
                  {small.mergeable
                    .map((b) => b.map((id) => labelOf(machine, id)).join(' and '))
                    .join('; ')}
                  .
                </Text>
              ) : null}
              {small.unreachable.length > 0 ? (
                <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.xs }}>
                  Unreachable from the start:{' '}
                  {small.unreachable.map((id) => labelOf(machine, id)).join(', ')}.
                </Text>
              ) : null}
            </Section>
          ) : null}

          {drawn && subset ? (
            <Section title={`Determinised: ${subset.states.length} subsets`} palette={palette}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.tableHead}>
                    <Text style={{ ...TYPE.monoSmall, color: palette.muted, width: 140 }}>
                      subset
                    </Text>
                    {level.alphabet.map((a) => (
                      <Text
                        key={a}
                        style={{ ...TYPE.monoSmall, color: palette.muted, width: 124 }}
                      >
                        on {a}
                      </Text>
                    ))}
                  </View>
                  {subset.states.map((s) => (
                    <View key={s.id} style={styles.tableRow}>
                      <Text
                        selectable
                        style={{
                          ...TYPE.mono,
                          color: s.accepting ? palette.pass : palette.ink,
                          width: 140,
                        }}
                      >
                        {s.members.length === 0 ? '∅' : `{${s.members.join(',')}}`}
                        {s.id === subset.start ? ' ←' : ''}
                      </Text>
                      {level.alphabet.map((a) => {
                        const to = subset.edges.find((e) => e.from === s.id && e.symbol === a);
                        const target = subset.states.find((x) => x.id === to?.to);
                        return (
                          <Text
                            key={a}
                            selectable
                            style={{ ...TYPE.mono, color: palette.muted, width: 124 }}
                          >
                            {target === undefined || target.members.length === 0
                              ? '∅'
                              : `{${target.members.join(',')}}`}
                          </Text>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.sm }}>
                Nondeterminism buys size, never power.
              </Text>
            </Section>
          ) : null}

          <Section title="The diagram in words" palette={palette}>
            <Text selectable style={{ ...TYPE.body, color: palette.ink }}>
              {machineSpeech(machine, level)}
            </Text>
          </Section>
        </View>
      ) : null}
    </Sheet>
  );
}

const labelOf = (m: Machine, id: string): string =>
  m.states.find((s) => s.id === id)?.label ?? id;

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: SPACE.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACE.lg,
  },
  tab: {
    minHeight: TAP - 6,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  first: { paddingBottom: SPACE.lg },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.lg,
  },
  action: {
    marginTop: SPACE.md,
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: RADIUS.control,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  tableHead: { flexDirection: 'row', paddingBottom: SPACE.xs },
  tableRow: { flexDirection: 'row', minHeight: 24, alignItems: 'center' },
});
