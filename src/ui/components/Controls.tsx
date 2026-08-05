/**
 * Pressable primitives. Every control is at least 44pt, springs on press, and
 * carries a screen reader label.
 */

import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { elevation, RADIUS, SPACE, SPRING_SNAPPY, TAP, TYPE, type Palette } from '../theme';
import * as haptics from '../haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonTone = 'plain' | 'accent' | 'quiet' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  palette: Palette;
  tone?: ButtonTone;
  disabled?: boolean;
  /** Fills the row it sits in. */
  grow?: boolean;
  hint?: string;
  style?: ViewStyle;
  testID?: string;
  compact?: boolean;
}

export function Button(props: ButtonProps) {
  const { label, onPress, palette, tone = 'plain', disabled = false, grow, compact } = props;
  const press = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.035 }],
    opacity: 1 - press.value * 0.08,
  }));

  const colours: Record<ButtonTone, { bg: string; fg: string; border: string }> = {
    plain: { bg: palette.surface, fg: palette.ink, border: palette.hairline },
    accent: { bg: palette.accent, fg: '#FFFFFF', border: palette.accent },
    quiet: { bg: 'transparent', fg: palette.muted, border: 'transparent' },
    danger: { bg: palette.failTint, fg: palette.fail, border: palette.failTint },
  };
  const c = colours[tone];

  return (
    <AnimatedPressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => {
        press.value = withSpring(1, SPRING_SNAPPY);
      }}
      onPressOut={() => {
        press.value = withSpring(0, SPRING_SNAPPY);
      }}
      onPress={() => {
        if (disabled) return;
        haptics.tick();
        onPress();
      }}
      style={[
        styles.button,
        compact ? styles.buttonCompact : null,
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          opacity: disabled ? 0.38 : 1,
          flexGrow: grow ? 1 : 0,
          flexBasis: grow ? 0 : 'auto',
        },
        tone === 'accent' ? elevation(1, palette) : null,
        props.style,
        animated,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{ ...(compact ? TYPE.small : TYPE.bodyStrong), color: c.fg, fontWeight: '600' }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** A small state, on or off. Used for Connect and the formal panel toggle. */
export function Toggle({
  label,
  on,
  onPress,
  palette,
  disabled,
  testID,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  palette: Palette;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      palette={palette}
      tone={on ? 'accent' : 'plain'}
      disabled={disabled}
      testID={testID}
      grow
      compact
    />
  );
}

export function Card({
  children,
  palette,
  style,
  level = 1,
}: {
  children: ReactNode;
  palette: Palette;
  style?: ViewStyle;
  level?: 1 | 2 | 3;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: palette.surface,
          borderRadius: RADIUS.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.hairline,
        },
        elevation(level, palette),
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ text, palette }: { text: string; palette: Palette }) {
  return (
    <Text style={{ ...TYPE.label, color: palette.muted, textTransform: 'uppercase' }}>{text}</Text>
  );
}

export function Divider({ palette }: { palette: Palette }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.hairline }} />;
}

/** A row of mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  palette,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  palette: Palette;
  label?: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.segmented, { backgroundColor: palette.surfaceSunken }]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              haptics.tick();
              onChange(o.value);
            }}
            style={[
              styles.segment,
              on ? { backgroundColor: palette.surface, borderColor: palette.accent } : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                ...TYPE.small,
                fontWeight: on ? '700' : '500',
                color: on ? palette.accentInk : palette.muted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const, userSelect: 'none' as const }, default: {} }),
  },
  buttonCompact: {
    minHeight: TAP,
    paddingHorizontal: SPACE.sm,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: RADIUS.control,
    padding: 3,
    gap: 3,
  },
  segment: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 38,
    borderRadius: RADIUS.control - 3,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xs,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
});
