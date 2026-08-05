/**
 * Touch feedback. Real on iOS, a no-op everywhere else, so call sites never
 * branch on platform.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const on = Platform.OS === 'ios';

const safely = (fn: () => Promise<unknown>): void => {
  if (!on) return;
  void fn().catch(() => undefined);
};

/** A state was selected, a control was pressed. */
export const tick = (): void =>
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** An arrow was committed, a state was dropped. */
export const commit = (): void =>
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** The suite passed. */
export const pass = (): void =>
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** The suite failed. */
export const fail = (): void =>
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
