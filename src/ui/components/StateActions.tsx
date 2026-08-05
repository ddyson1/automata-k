/**
 * Actions for the selected state. Floats inside the canvas card so the dock
 * below never changes contents.
 */

import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import type { Machine, StateId } from '../../engine/types';
import { RADIUS, SPACE, TAP, TYPE, type Palette } from '../theme';
import { Button } from './Controls';

export interface StateActionsProps {
  palette: Palette;
  machine: Machine;
  id: StateId;
  onSetStart: () => void;
  onToggleAccepting: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function StateActions(props: StateActionsProps) {
  const { palette, machine, id } = props;
  const state = machine.states.find((s) => s.id === id);
  if (!state) return null;

  const isStart = machine.start === id;
  const isAccepting = machine.accepting.includes(id);

  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(120)}
      style={[
        styles.bar,
        { backgroundColor: palette.ground, borderTopColor: palette.hairline },
      ]}
    >
      <View style={styles.title}>
        <Text style={{ ...TYPE.mono, color: palette.ink, fontWeight: '700' }}>{state.label}</Text>
      </View>
      <Button
        label={isStart ? 'Start' : 'Make start'}
        palette={palette}
        tone={isStart ? 'accent' : 'plain'}
        compact
        grow
        onPress={props.onSetStart}
      />
      <Button
        label={isAccepting ? 'Accepting' : 'Make accepting'}
        palette={palette}
        tone={isAccepting ? 'accent' : 'plain'}
        compact
        grow
        onPress={props.onToggleAccepting}
      />
      <Button label="Rename" palette={palette} compact onPress={props.onRename} />
      <Button label="Delete" palette={palette} tone="danger" compact onPress={props.onDelete} />
    </Animated.View>
  );
}

/** Shown while Connect is armed. */
export function ConnectPrompt({ palette, label }: { palette: Palette; label: string }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(120)}
      style={[styles.prompt, { backgroundColor: palette.accentTintStrong }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={{ ...TYPE.small, color: palette.accentInk, fontWeight: '600' }}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    minHeight: TAP + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  title: {
    minWidth: 34,
    paddingHorizontal: SPACE.xs,
  },
  prompt: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.pill,
  },
});
