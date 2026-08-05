/**
 * δ, permanent and editable.
 *
 * The transition function is not a readout of the diagram and the diagram is
 * not a preview of it: they are one machine seen twice. Every rule is a row,
 * every row opens in place, and nothing here is a modal sheet. For a
 * deterministic class the unwired pairs get rows too, in red, and tapping one
 * writes the rule.
 */

import { memo, useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deltaSignature } from '../../engine/formal';
import {
  BLANK,
  EPSILON,
  STACK_BOTTOM,
  type Level,
  type Machine,
  type Move,
  type StateId,
  type Transition,
  type TransitionId,
} from '../../engine/types';
import { findMissingPairs } from '../../engine/validate';
import { RADIUS, SPACE, TAP, TYPE, type Palette } from '../theme';

export interface LedgerProps {
  level: Level;
  machine: Machine;
  palette: Palette;
  highlight: readonly TransitionId[];
  /** Row currently open for editing, by row id. */
  openRow: string | null;
  onOpenRow: (id: string | null) => void;
  onFocusTransition: (t: Transition) => void;
  onUpdate: (id: TransitionId, patch: Partial<Transition>) => void;
  onDelete: (id: TransitionId) => void;
  /** Write the rule for an unwired pair. */
  onFillGap: (from: StateId, symbol: string) => void;
  onAddRule: () => void;
}

interface Row {
  id: string;
  gap: boolean;
  from: StateId;
  symbol: string;
  transition?: Transition;
  /** Rendered as segments so the editable parts can be tinted. */
  text: string;
}

const labelOf = (m: Machine, id: StateId): string =>
  m.states.find((s) => s.id === id)?.label ?? '?';

function renderRule(t: Transition, m: Machine, level: Level): string {
  const from = labelOf(m, t.from);
  const to = labelOf(m, t.to);
  switch (level.type) {
    case 'DFA':
      return `δ(${from}, ${t.read}) = ${to}`;
    case 'NFA':
      return `δ(${from}, ${t.read}) ∋ ${to}`;
    case 'PDA':
      return `δ(${from}, ${t.read}, ${t.pop ?? EPSILON}) ∋ (${to}, ${t.push ?? EPSILON})`;
    case 'TM':
      return `δ(${from}, ${t.read}) = (${to}, ${t.write ?? t.read}, ${t.move ?? 'R'})`;
  }
}

function buildRows(m: Machine, level: Level): Row[] {
  const rows: Row[] = [];

  if (level.type === 'DFA') {
    // Ordered by state then symbol, so the list reads like a table.
    for (const s of m.states) {
      for (const a of level.alphabet) {
        const arrows = m.transitions.filter((t) => t.from === s.id && t.read === a);
        if (arrows.length === 0) {
          rows.push({
            id: `gap:${s.id}:${a}`,
            gap: true,
            from: s.id,
            symbol: a,
            text: `δ(${s.label}, ${a}) = undefined`,
          });
        } else {
          for (const t of arrows) {
            rows.push({
              id: t.id,
              gap: false,
              from: t.from,
              symbol: t.read,
              transition: t,
              text: renderRule(t, m, level),
            });
          }
        }
      }
    }
    // Anything on a symbol outside Sigma would otherwise vanish from the list.
    for (const t of m.transitions) {
      if (!level.alphabet.includes(t.read)) {
        rows.push({
          id: t.id,
          gap: false,
          from: t.from,
          symbol: t.read,
          transition: t,
          text: renderRule(t, m, level),
        });
      }
    }
    return rows;
  }

  for (const t of m.transitions) {
    rows.push({
      id: t.id,
      gap: false,
      from: t.from,
      symbol: t.read,
      transition: t,
      text: renderRule(t, m, level),
    });
  }
  return rows;
}

/** The options each editable field offers, per machine class. */
function fieldsFor(
  level: Level,
  machine: Machine,
): { key: keyof Transition; label: string; options: string[] }[] {
  const states = machine.states.map((s) => s.id);
  const readOptions =
    level.type === 'TM'
      ? (level.tapeAlphabet ?? [...level.alphabet, BLANK])
      : level.type === 'DFA'
        ? level.alphabet
        : [...level.alphabet, EPSILON];
  const stack = [...(level.stackAlphabet ?? [STACK_BOTTOM]), EPSILON];
  const tape = level.tapeAlphabet ?? [...level.alphabet, BLANK];

  const base: { key: keyof Transition; label: string; options: string[] }[] = [
    { key: 'read', label: 'Read', options: readOptions },
  ];
  if (level.type === 'PDA') {
    base.push({ key: 'pop', label: 'Pop', options: stack });
    base.push({ key: 'push', label: 'Push', options: stack });
  }
  if (level.type === 'TM') {
    base.push({ key: 'write', label: 'Write', options: tape });
    base.push({ key: 'move', label: 'Move', options: ['L', 'R'] });
  }
  base.push({ key: 'to', label: 'To', options: states });
  return base;
}

export const Ledger = memo(function Ledger(props: LedgerProps) {
  const {
    level,
    machine,
    palette,
    highlight,
    openRow,
    onOpenRow,
    onFocusTransition,
    onUpdate,
    onDelete,
    onFillGap,
    onAddRule,
  } = props;

  const rows = useMemo(() => buildRows(machine, level), [machine, level]);
  const fields = useMemo(() => fieldsFor(level, machine), [level, machine]);
  const lit = useMemo(() => new Set(highlight), [highlight]);

  const gaps = findMissingPairs(machine, level.type, level.alphabet).length;
  const pairs = machine.states.length * level.alphabet.length;
  const defined = rows.filter((r) => !r.gap).length;

  const summary =
    level.type === 'DFA'
      ? gaps === 0
        ? `${pairs} of ${pairs} defined`
        : `${pairs - gaps} of ${pairs} defined`
      : `${defined} ${defined === 1 ? 'rule' : 'rules'}`;

  return (
    <View style={styles.wrap}>
      <View style={[styles.head, { borderBottomColor: palette.hairline }]}>
        <Text style={{ ...TYPE.monoSmall, color: palette.muted }} numberOfLines={1}>
          {deltaSignature(level.type)}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          style={{
            ...TYPE.label,
            color: level.type === 'DFA' && gaps > 0 ? palette.fail : palette.muted,
          }}
        >
          {summary.toUpperCase()}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: SPACE.xl }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: palette.muted }]}>
            No rules yet. Draw an arrow on the diagram, or write one here.
          </Text>
        ) : null}

        {rows.map((row) => {
          const open = openRow === row.id;
          const on = row.transition ? lit.has(row.transition.id) : false;
          return (
            <View key={row.id} style={{ borderTopColor: palette.hairline, borderTopWidth: StyleSheet.hairlineWidth }}>
              <Pressable
                testID={`rule-${row.id}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={row.text}
                accessibilityHint={
                  row.gap ? 'Unwired pair. Opens to write this rule.' : 'Opens to edit this rule.'
                }
                onPress={() => {
                  if (row.gap) {
                    onFillGap(row.from, row.symbol);
                    return;
                  }
                  if (row.transition) onFocusTransition(row.transition);
                  onOpenRow(open ? null : row.id);
                }}
                style={[
                  styles.row,
                  on && !open ? { backgroundColor: palette.accentTint } : null,
                  open ? { backgroundColor: palette.surfaceSunken } : null,
                ]}
              >
                <Text
                  selectable
                  style={{
                    ...TYPE.mono,
                    color: row.gap ? palette.fail : open || on ? palette.accentInk : palette.ink,
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {row.text}
                </Text>
                <View style={{ flex: 1 }} />
                {row.gap ? (
                  <Text style={{ ...TYPE.label, color: palette.fail }}>DEAD</Text>
                ) : (
                  <Text style={{ ...TYPE.label, color: palette.muted }}>
                    {open ? 'DONE' : 'EDIT'}
                  </Text>
                )}
              </Pressable>

              {open && row.transition ? (
                <View style={[styles.editor, { borderTopColor: palette.hairline }]}>
                  {fields.map((field) => {
                    const current =
                      field.key === 'to'
                        ? (row.transition as Transition).to
                        : ((row.transition as Transition)[field.key] as string | undefined) ??
                          (field.key === 'write' ? (row.transition as Transition).read : EPSILON);
                    return (
                      <View key={String(field.key)} style={styles.field}>
                        <Text style={[styles.fieldLabel, { color: palette.muted }]}>
                          {field.label.toUpperCase()}
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.options}
                        >
                          {field.options.map((opt) => {
                            const selected = current === opt;
                            const text =
                              field.key === 'to' ? labelOf(machine, opt) : opt === 'L' ? 'L' : opt;
                            return (
                              <Pressable
                                key={opt}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                accessibilityLabel={`${field.label} ${text}`}
                                onPress={() =>
                                  onUpdate((row.transition as Transition).id, {
                                    [field.key]: field.key === 'move' ? (opt as Move) : opt,
                                  })
                                }
                                style={[
                                  styles.opt,
                                  {
                                    borderColor: selected ? palette.accent : palette.hairline,
                                    backgroundColor: selected
                                      ? palette.accentTintStrong
                                      : palette.surface,
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    ...TYPE.mono,
                                    color: selected ? palette.accentInk : palette.ink,
                                  }}
                                >
                                  {text}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    );
                  })}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete this rule"
                    onPress={() => {
                      onDelete((row.transition as Transition).id);
                      onOpenRow(null);
                    }}
                    style={styles.delete}
                  >
                    <Text style={{ ...TYPE.small, color: palette.fail, fontWeight: '600' }}>
                      Delete rule
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}

        <Pressable
          testID="add-rule"
          accessibilityRole="button"
          accessibilityLabel="Write a new rule"
          onPress={onAddRule}
          disabled={machine.states.length === 0}
          style={[
            styles.add,
            { borderColor: palette.hairline, opacity: machine.states.length === 0 ? 0.4 : 1 },
          ]}
        >
          <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>+ new rule</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    ...TYPE.small,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.lg,
  },
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    gap: SPACE.sm,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  editor: {
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACE.sm,
  },
  field: { gap: 5 },
  fieldLabel: { ...TYPE.label },
  options: { flexDirection: 'row', gap: SPACE.xs, paddingRight: SPACE.lg },
  opt: {
    minWidth: 38,
    minHeight: 34,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.chip,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  delete: {
    minHeight: 36,
    justifyContent: 'center',
    marginTop: SPACE.xs,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  add: {
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.md,
    paddingVertical: SPACE.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: RADIUS.control,
    alignItems: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
});
