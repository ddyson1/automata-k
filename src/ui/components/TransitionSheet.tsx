/**
 * Edit the transitions on one arrow. The controls change per machine class,
 * because δ has a different shape in each one.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { transitionChip } from '../../engine/formal';
import {
  BLANK,
  EPSILON,
  STACK_BOTTOM,
  type Level,
  type Machine,
  type Move,
  type Transition,
} from '../../engine/types';
import { RADIUS, SPACE, TYPE, type Palette } from '../theme';
import { Button, Divider, Label, Segmented } from './Controls';
import { Sheet } from './Sheet';

export interface TransitionSheetProps {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  level: Level;
  machine: Machine;
  /** `${from}->${to}` */
  edgeKey: string | null;
  onUpdate: (id: string, patch: Partial<Transition>) => void;
  onDelete: (id: string) => void;
  onAdd: (from: string, to: string) => void;
}

const labelOf = (m: Machine, id: string): string =>
  m.states.find((s) => s.id === id)?.label ?? id;

export function TransitionSheet(props: TransitionSheetProps) {
  const { visible, onClose, palette, level, machine, edgeKey, onUpdate, onDelete, onAdd } = props;

  const [from, to] = useMemo(() => (edgeKey ?? '->').split('->'), [edgeKey]);
  const rules = useMemo(
    () => machine.transitions.filter((t) => t.from === from && t.to === to),
    [machine.transitions, from, to],
  );

  if (!edgeKey || !from || !to) return null;

  const readOptions =
    level.type === 'TM'
      ? (level.tapeAlphabet ?? [...level.alphabet, BLANK])
      : level.type === 'DFA'
        ? level.alphabet
        : [...level.alphabet, EPSILON];

  const stackOptions = [...(level.stackAlphabet ?? [STACK_BOTTOM]), EPSILON];
  const tapeOptions = level.tapeAlphabet ?? [...level.alphabet, BLANK];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      palette={palette}
      title={`${labelOf(machine, from)} to ${labelOf(machine, to)}`}
      subtitle={
        rules.length === 0
          ? 'This arrow has no rules yet.'
          : `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} on this arrow.`
      }
      testID="transition-sheet"
    >
      {rules.map((t, i) => (
        <View key={t.id} style={styles.rule}>
          <View style={styles.ruleHead}>
            <View style={[styles.chip, { backgroundColor: palette.accentTint }]}>
              <Text style={{ ...TYPE.mono, color: palette.accentInk }}>
                {transitionChip(t, level.type)}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <Button
              label="Delete"
              tone="danger"
              compact
              palette={palette}
              onPress={() => onDelete(t.id)}
            />
          </View>

          <Label text={level.type === 'TM' ? 'Read' : 'Read symbol'} palette={palette} />
          <Segmented
            label="Read symbol"
            palette={palette}
            value={t.read}
            options={readOptions.map((s) => ({ value: s, label: s }))}
            onChange={(v) => onUpdate(t.id, { read: v })}
          />

          {level.type === 'PDA' ? (
            <>
              <View style={styles.gap} />
              <Label text="Pop" palette={palette} />
              <Segmented
                label="Pop"
                palette={palette}
                value={t.pop ?? EPSILON}
                options={stackOptions.map((s) => ({ value: s, label: s }))}
                onChange={(v) => onUpdate(t.id, { pop: v })}
              />
              <View style={styles.gap} />
              <Label text="Push" palette={palette} />
              <Segmented
                label="Push"
                palette={palette}
                value={t.push ?? EPSILON}
                options={stackOptions.map((s) => ({ value: s, label: s }))}
                onChange={(v) => onUpdate(t.id, { push: v })}
              />
            </>
          ) : null}

          {level.type === 'TM' ? (
            <>
              <View style={styles.gap} />
              <Label text="Write" palette={palette} />
              <Segmented
                label="Write"
                palette={palette}
                value={t.write ?? t.read}
                options={tapeOptions.map((s) => ({ value: s, label: s }))}
                onChange={(v) => onUpdate(t.id, { write: v })}
              />
              <View style={styles.gap} />
              <Label text="Move" palette={palette} />
              <Segmented
                label="Move"
                palette={palette}
                value={(t.move ?? 'R') as Move}
                options={[
                  { value: 'L' as Move, label: 'Left' },
                  { value: 'R' as Move, label: 'Right' },
                ]}
                onChange={(v) => onUpdate(t.id, { move: v })}
              />
            </>
          ) : null}

          {i < rules.length - 1 ? (
            <View style={styles.gap}>
              <Divider palette={palette} />
            </View>
          ) : null}
        </View>
      ))}

      <View style={styles.footer}>
        <Button
          label="Add another rule"
          palette={palette}
          grow
          onPress={() => onAdd(from, to)}
          hint="Adds a second label to this arrow"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rule: {
    marginBottom: SPACE.lg,
  },
  ruleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.sm,
  },
  chip: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.chip,
  },
  gap: {
    marginTop: SPACE.md,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.sm,
  },
});
