/**
 * Design tokens.
 *
 * Cool plaster ground, white surfaces, cobalt for anything the player is doing
 * right now, green and red only for verdicts. Monospace is reserved for machine
 * notation so the formal layer reads as a different register from the UI.
 */

import { Platform } from 'react-native';

export interface Palette {
  ground: string;
  surface: string;
  surfaceSunken: string;
  ink: string;
  muted: string;
  hairline: string;
  accent: string;
  accentTint: string;
  accentTintStrong: string;
  accentInk: string;
  pass: string;
  passTint: string;
  fail: string;
  failTint: string;
  scrim: string;
  shadow: string;
}

export const LIGHT: Palette = {
  ground: '#E9EBEF',
  surface: '#FFFFFF',
  surfaceSunken: '#F4F5F8',
  ink: '#1D2430',
  muted: '#5A6272',
  hairline: '#DCDFE6',
  accent: '#2A50D8',
  accentTint: '#EAEFFD',
  accentTintStrong: '#DDE5FD',
  accentInk: '#1B3AA6',
  pass: '#12876A',
  passTint: '#DFF3EC',
  fail: '#C0392B',
  failTint: '#FCE3DE',
  scrim: 'rgba(29, 36, 48, 0.34)',
  shadow: '#1D2430',
};

/** Section 10.8. Same hues, re-grounded so the plaster reads as slate. */
export const DARK: Palette = {
  ground: '#14171D',
  surface: '#1E222A',
  surfaceSunken: '#191D24',
  ink: '#EEF1F6',
  muted: '#9AA3B2',
  hairline: '#2C323C',
  accent: '#7C97F5',
  accentTint: '#232B44',
  accentTintStrong: '#2C3757',
  accentInk: '#C3D0FB',
  pass: '#4FD1A5',
  passTint: '#17322B',
  fail: '#F0836F',
  failTint: '#37211E',
  scrim: 'rgba(0, 0, 0, 0.55)',
  shadow: '#000000',
};

export const RADIUS = {
  chip: 8,
  control: 12,
  card: 20,
  sheet: 24,
  pill: 999,
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Minimum touch target, per section 7. */
export const TAP = 44;

export const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}) as string;

export const TYPE = {
  display: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.8 },
  mono: { fontSize: 13, lineHeight: 20, fontFamily: MONO },
  monoSmall: { fontSize: 11.5, lineHeight: 17, fontFamily: MONO },
} as const;

/** Soft shadow for raised surfaces. Web gets a box shadow, native gets the real thing. */
export const elevation = (level: 1 | 2 | 3, palette: Palette) => {
  const spec = { 1: [2, 6, 0.06], 2: [6, 16, 0.1], 3: [12, 32, 0.16] }[level] as [
    number,
    number,
    number,
  ];
  const [offset, blur, opacity] = spec;
  if (Platform.OS === 'android') return { elevation: level * 3 };
  return {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: offset },
    shadowOpacity: opacity,
    shadowRadius: blur,
  };
};

/** Spring used for every press and sheet. One curve, applied everywhere. */
export const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;
export const SPRING_SNAPPY = { damping: 22, stiffness: 340, mass: 0.6 } as const;
