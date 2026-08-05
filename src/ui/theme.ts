/**
 * Design tokens.
 *
 * Notebook: warm paper, hairline rules, almost no fill. Structure comes from
 * dividers and space rather than from cards and shadows, so the permanent δ
 * list reads as part of one document instead of a stack of panels.
 *
 * Serif for level titles, sans for interface text, mono for anything that is
 * machine notation. The accent is a muted ochre, which sits on paper without
 * shouting and leaves green and red free to mean pass and fail.
 */

import { Platform } from 'react-native';

export interface Palette {
  ground: string;
  surface: string;
  surfaceSunken: string;
  ink: string;
  muted: string;
  hairline: string;
  /** A heavier rule, for the divisions that matter. */
  rule: string;
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
  ground: '#FBFAF7',
  surface: '#FFFFFF',
  surfaceSunken: '#F4F2EC',
  ink: '#22252A',
  muted: '#71756F',
  hairline: '#E4E1D8',
  rule: '#CFCBBE',
  accent: '#6E5A24',
  accentTint: '#F5F1E3',
  accentTintStrong: '#E9E2CB',
  accentInk: '#54441A',
  pass: '#3B6B4C',
  passTint: '#F0F6F1',
  fail: '#9A3E1F',
  failTint: '#FBF1ED',
  scrim: 'rgba(34, 37, 42, 0.3)',
  shadow: '#22252A',
};

export const DARK: Palette = {
  ground: '#1A1A18',
  surface: '#212220',
  surfaceSunken: '#1D1E1C',
  ink: '#ECEAE3',
  muted: '#9A9A92',
  hairline: '#33342F',
  rule: '#43443D',
  accent: '#C9AE6A',
  accentTint: '#2A2820',
  accentTintStrong: '#3A3626',
  accentInk: '#DFC98B',
  pass: '#6FA57F',
  passTint: '#1B2A20',
  fail: '#D3805F',
  failTint: '#2E1F1A',
  scrim: 'rgba(0, 0, 0, 0.55)',
  shadow: '#000000',
};

export const RADIUS = {
  chip: 5,
  control: 8,
  card: 4,
  sheet: 16,
  pill: 999,
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
} as const;

/** Minimum touch target. */
export const TAP = 44;

export const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}) as string;

export const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'ui-serif, "Iowan Old Style", Palatino, Georgia, serif',
}) as string;

export const TYPE = {
  /** Level titles. The one place the serif appears. */
  display: { fontSize: 25, lineHeight: 30, fontFamily: SERIF },
  title: { fontSize: 20, lineHeight: 25, fontFamily: SERIF },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  /** Mono uppercase section labels, the Notebook structural device. */
  label: { fontSize: 10, lineHeight: 13, fontWeight: '500' as const, letterSpacing: 1.4, fontFamily: MONO },
  mono: { fontSize: 13, lineHeight: 20, fontFamily: MONO },
  monoSmall: { fontSize: 11.5, lineHeight: 17, fontFamily: MONO },
} as const;

/**
 * Notebook keeps its surfaces flat. Only things that genuinely float above the
 * page get a shadow, and even then a soft one.
 */
export const elevation = (level: 1 | 2 | 3, palette: Palette) => {
  if (level === 1) return {};
  if (Platform.OS === 'android') return { elevation: level * 2 };
  const spec = { 2: [3, 10, 0.07], 3: [8, 22, 0.12] }[level] as [number, number, number];
  const [offset, blur, opacity] = spec;
  return {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: offset },
    shadowOpacity: opacity,
    shadowRadius: blur,
  };
};

export const SPRING = { damping: 20, stiffness: 220, mass: 0.7 } as const;
export const SPRING_SNAPPY = { damping: 24, stiffness: 340, mass: 0.6 } as const;

/** How long after the last edit the suite re-grades. */
export const GRADE_DEBOUNCE_MS = 180;
