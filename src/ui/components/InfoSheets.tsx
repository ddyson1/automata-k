/**
 * Level notes and the hint.
 *
 * The notes sheet is part of the formal layer, not a help screen: the language
 * in set-builder form, a grammar that generates it, where it sits in the
 * hierarchy, and the definition of the machine class with its acceptance
 * condition.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { grammarLines, grammarTuple, hierarchyRow, MACHINE_CLASS } from '../../engine/formal';
import type { Level } from '../../engine/types';
import { RADIUS, SPACE, TYPE, type Palette } from '../theme';
import { Button, Divider, Label } from './Controls';
import { Sheet } from './Sheet';

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
    <View style={styles.section}>
      <Label text={title} palette={palette} />
      <View style={{ height: SPACE.xs }} />
      {children}
    </View>
  );
}

export function NotesSheet({
  visible,
  onClose,
  palette,
  level,
}: {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  level: Level;
}) {
  const row = hierarchyRow(level.chomsky);
  const klass = MACHINE_CLASS[level.type];
  const gr = level.grammar;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      palette={palette}
      title={level.title}
      subtitle={`Level ${level.index}. ${klass.name}.`}
      testID="notes-sheet"
    >
      <Section title="Language" palette={palette}>
        <Mono text={level.setBuilder} palette={palette} />
      </Section>

      <Section title="Grammar" palette={palette}>
        <View style={[styles.block, { backgroundColor: palette.surfaceSunken }]}>
          {grammarTuple(gr).map((t) => (
            <Text key={t.symbol} selectable style={{ ...TYPE.monoSmall, color: palette.muted }}>
              {t.symbol} = {t.value}
            </Text>
          ))}
          <View style={{ height: SPACE.xs }} />
          {grammarLines(gr).map((line) => (
            <Mono key={line} text={line} palette={palette} />
          ))}
        </View>
        {gr.note ? (
          <Text style={{ ...TYPE.small, color: palette.muted, marginTop: SPACE.xs }}>
            {gr.note}
          </Text>
        ) : null}
      </Section>

      <Section title={`Chomsky type ${row.type}`} palette={palette}>
        <Text style={{ ...TYPE.body, color: palette.ink }}>
          {row.name}. Productions of the shape {row.productions}. Recognised by a{' '}
          {row.machine.toLowerCase()}.
        </Text>
      </Section>

      <Divider palette={palette} />

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

      <View style={{ height: SPACE.md }} />
      <Button label="Close" palette={palette} grow onPress={onClose} />
    </Sheet>
  );
}

export function HintSheet({
  visible,
  onClose,
  palette,
  level,
  alreadyShown,
  onReveal,
}: {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  level: Level;
  alreadyShown: boolean;
  onReveal: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      palette={palette}
      title="Hint"
      subtitle={`Par is ${level.par} ${level.par === 1 ? 'state' : 'states'}.`}
      testID="hint-sheet"
    >
      <Text style={{ ...TYPE.body, color: palette.ink }}>{level.hint}</Text>

      <View style={[styles.warn, { backgroundColor: palette.surfaceSunken }]}>
        <Text style={{ ...TYPE.small, color: palette.muted }}>
          {alreadyShown
            ? 'You have already seen the worked solution for this level. Solves here are marked as shown.'
            : 'The worked solution replaces whatever is on the canvas, and the solve is marked as shown.'}
        </Text>
      </View>

      <View style={styles.footer}>
        <Button
          label="Show the solution"
          palette={palette}
          grow
          onPress={onReveal}
          testID="reveal-solution"
          hint="Replaces the canvas with a verified machine"
        />
        <Button label="Keep trying" palette={palette} tone="accent" grow onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACE.lg,
  },
  block: {
    borderRadius: RADIUS.control,
    padding: SPACE.md,
  },
  warn: {
    borderRadius: RADIUS.control,
    padding: SPACE.md,
    marginTop: SPACE.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginTop: SPACE.lg,
  },
});
