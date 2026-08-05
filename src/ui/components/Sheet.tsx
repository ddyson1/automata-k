/**
 * Bottom sheet: grab handle, drag to dismiss, backdrop tap to close.
 * Section 7 asks for all three, on both platforms.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, RADIUS, SPACE, SPRING, TYPE, type Palette } from '../theme';
import { useReducedMotion } from '../usePalette';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Sheets that own the screen, like the win sheet, keep the backdrop opaque. */
  maxHeightRatio?: number;
  testID?: string;
}

export function Sheet(props: SheetProps) {
  const { visible, onClose, palette, title, subtitle, children, maxHeightRatio = 0.82 } = props;
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(420);
  const [mounted, setMounted] = useState(visible);

  const y = useSharedValue(600);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.value = reduced ? 0 : withSpring(0, SPRING);
      backdrop.value = withTiming(1, { duration: reduced ? 0 : 160 });
      return;
    }
    backdrop.value = withTiming(0, { duration: reduced ? 0 : 140 });
    const finish = () => setMounted(false);
    if (reduced) {
      y.value = height + insets.bottom + 40;
      finish();
    } else {
      y.value = withSpring(height + insets.bottom + 40, { ...SPRING, damping: 24 }, (done) => {
        if (done) runOnJS(finish)();
      });
    }
  }, [visible, height, insets.bottom, reduced, y, backdrop]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      y.value = Math.max(0, y.value + e.changeY);
    })
    .onEnd((e) => {
      if (y.value > height * 0.28 || e.velocityY > 900) {
        runOnJS(onClose)();
      } else {
        y.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View
        testID={props.testID}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          {
            backgroundColor: palette.ground,
            borderTopColor: palette.rule,
            paddingBottom: insets.bottom + SPACE.lg,
            maxHeight: `${Math.round(maxHeightRatio * 100)}%`,
          },
          elevation(3, palette),
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.grabZone} accessible accessibilityLabel="Drag down to dismiss">
            <View style={[styles.grab, { backgroundColor: palette.hairline }]} />
          </View>
        </GestureDetector>

        {title ? (
          <View style={styles.header}>
            <Text style={{ ...TYPE.title, color: palette.ink }}>{title}</Text>
            {subtitle ? (
              <Text style={{ ...TYPE.small, color: palette.muted, marginTop: 2 }}>{subtitle}</Text>
            ) : null}
          </View>
        ) : null}

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({ web: { maxWidth: 560, marginHorizontal: 'auto' as const }, default: {} }),
  },
  grabZone: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: SPACE.xl,
    paddingBottom: SPACE.md,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: SPACE.xl,
    paddingBottom: SPACE.sm,
  },
});
