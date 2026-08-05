/**
 * What the machine on the canvas actually is, beyond the diagram.
 *
 *   Regex    section 10.4, by state elimination
 *   Subsets  section 10.2, the DFA an NFA determinises to, state by state
 *   Smallest section 10.1, Hopcroft on the drawn machine
 *   Text     section 10.8, a text alternative to the diagram driven by δ
 */

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { machineSpeech } from '../../engine/formal';
import { minimise, subsetConstruction } from '../../engine/minimize';
import { regexFor } from '../../engine/regex';
import type { Level, Machine } from '../../engine/types';
import { RADIUS, SPACE, TYPE, type Palette } from '../theme';
import { Button, Label, Segmented } from './Controls';
import { Sheet } from './Sheet';

type Section = 'regex' | 'subset' | 'smallest' | 'text';

export interface AnalysisSheetProps {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  level: Level;
  machine: Machine;
  initial: Section;
}

/** Which sections make sense for a machine class. */
export function sectionsFor(level: Level): { value: Section; label: string }[] {
  const out: { value: Section; label: string }[] = [];
  if (level.type === 'DFA' || level.type === 'NFA') out.push({ value: 'regex', label: 'Regex' });
  if (level.type === 'NFA') out.push({ value: 'subset', label: 'Subsets' });
  if (level.type === 'DFA') out.push({ value: 'smallest', label: 'Smallest' });
  out.push({ value: 'text', label: 'Text' });
  return out;
}

function Block({ palette, children }: { palette: Palette; children: React.ReactNode }) {
  return (
    <View style={[styles.block, { backgroundColor: palette.surfaceSunken }]}>{children}</View>
  );
}

export function AnalysisSheet(props: AnalysisSheetProps) {
  const { visible, onClose, palette, level, machine, initial } = props;
  const options = useMemo(() => sectionsFor(level), [level]);
  const [section, setSection] = useState<Section>(initial);
  // The sheet stays mounted while hidden, so the requested section has to be
  // picked up each time it opens rather than only on first render.
  useEffect(() => {
    if (visible) setSection(initial);
  }, [visible, initial]);
  const active = options.some((o) => o.value === section) ? section : (options[0]?.value ?? 'text');

  const regex = useMemo(
    () => (active === 'regex' ? regexFor(machine) : null),
    [active, machine],
  );
  const subset = useMemo(
    () => (active === 'subset' ? subsetConstruction(machine, level.alphabet) : null),
    [active, machine, level.alphabet],
  );
  const small = useMemo(
    () => (active === 'smallest' ? minimise(machine, level.alphabet) : null),
    [active, machine, level.alphabet],
  );

  const empty = machine.states.length === 0 || machine.start === null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      palette={palette}
      title="Analysis"
      subtitle="Computed from the machine on the canvas right now."
      testID="analysis-sheet"
    >
      {options.length > 1 ? (
        <>
          <Segmented
            label="Analysis view"
            palette={palette}
            value={active}
            options={options}
            onChange={setSection}
          />
          <View style={{ height: SPACE.lg }} />
        </>
      ) : null}

      {empty ? (
        <Text style={{ ...TYPE.body, color: palette.muted }}>
          Draw a machine first. There is nothing to analyse yet.
        </Text>
      ) : null}

      {!empty && active === 'regex' ? (
        <View>
          <Label text="Regular expression" palette={palette} />
          <View style={{ height: SPACE.xs }} />
          <Block palette={palette}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text selectable style={{ ...TYPE.mono, color: palette.ink }}>
                {regex ?? '∅'}
              </Text>
            </ScrollView>
          </Block>
          <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.sm }}>
            Found by state elimination: each state is removed in turn and the paths through it
            are folded into the edges around it. ∅ means the machine accepts nothing.
          </Text>
        </View>
      ) : null}

      {!empty && active === 'subset' && subset ? (
        <View>
          <Label text={`Determinised: ${subset.states.length} subsets`} palette={palette} />
          <View style={{ height: SPACE.xs }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.headRow}>
                <Text style={{ ...TYPE.monoSmall, color: palette.muted, width: 150 }}>subset</Text>
                {level.alphabet.map((a) => (
                  <Text
                    key={a}
                    style={{ ...TYPE.monoSmall, color: palette.muted, width: 130 }}
                  >
                    on {a}
                  </Text>
                ))}
              </View>
              {subset.states.map((s) => {
                const name = s.members.length === 0 ? '∅' : `{${s.members.join(',')}}`;
                return (
                  <View key={s.id} style={styles.row}>
                    <Text
                      selectable
                      style={{
                        ...TYPE.mono,
                        color: s.accepting ? palette.pass : palette.ink,
                        width: 150,
                      }}
                    >
                      {name}
                      {s.id === subset.start ? ' ←' : ''}
                    </Text>
                    {level.alphabet.map((a) => {
                      const to = subset.edges.find((e) => e.from === s.id && e.symbol === a);
                      const target = subset.states.find((x) => x.id === to?.to);
                      const label =
                        target === undefined || target.members.length === 0
                          ? '∅'
                          : `{${target.members.join(',')}}`;
                      return (
                        <Text
                          key={a}
                          selectable
                          style={{ ...TYPE.mono, color: palette.muted, width: 130 }}
                        >
                          {label}
                        </Text>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.sm }}>
            Each row is one subset of your states, reachable from the epsilon closure of the
            start. Accepting subsets are the ones that meet F. This is why nondeterminism buys
            size and never power.
          </Text>
        </View>
      ) : null}

      {!empty && active === 'smallest' && small ? (
        <View>
          <Label
            text={small.minimal ? 'Already minimal' : `${small.excess} more than necessary`}
            palette={palette}
          />
          <View style={{ height: SPACE.xs }} />
          <Block palette={palette}>
            <Text style={{ ...TYPE.mono, color: palette.ink }}>
              drawn {small.drawnStates}
              {small.sinkAdded ? ' plus an implicit dead state' : ''}
            </Text>
            <Text style={{ ...TYPE.mono, color: palette.ink }}>
              minimal {small.minimalStates}
            </Text>
          </Block>
          {small.mergeable.length > 0 ? (
            <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.sm }}>
              Equivalent, so they could merge:{' '}
              {small.mergeable
                .map((b) => b.map((id) => labelOf(machine, id)).join(' and '))
                .join('; ')}
              .
            </Text>
          ) : null}
          {small.unreachable.length > 0 ? (
            <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.xs }}>
              Unreachable from the start: {small.unreachable.map((id) => labelOf(machine, id)).join(', ')}.
            </Text>
          ) : null}
          <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.sm }}>
            Hopcroft partition refinement on your machine, completed first so a partial δ is not
            punished for its implicit dead state.
          </Text>
        </View>
      ) : null}

      {active === 'text' ? (
        <View>
          <Label text="The diagram in words" palette={palette} />
          <View style={{ height: SPACE.xs }} />
          <Text
            selectable
            accessibilityRole="text"
            style={{ ...TYPE.body, color: palette.ink }}
          >
            {machineSpeech(machine, level)}
          </Text>
          <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.sm }}>
            Everything the canvas shows, read off δ, for anyone not using the diagram.
          </Text>
        </View>
      ) : null}

      <View style={{ height: SPACE.lg }} />
      <Button label="Close" palette={palette} grow onPress={onClose} />
    </Sheet>
  );
}

const labelOf = (m: Machine, id: string): string =>
  m.states.find((s) => s.id === id)?.label ?? id;

const styles = StyleSheet.create({
  block: {
    borderRadius: RADIUS.control,
    padding: SPACE.md,
  },
  headRow: {
    flexDirection: 'row',
    paddingBottom: SPACE.xs,
  },
  row: {
    flexDirection: 'row',
    minHeight: 26,
    alignItems: 'center',
  },
});
