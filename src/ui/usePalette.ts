import { useMemo } from 'react';
import { AccessibilityInfo, useColorScheme, useWindowDimensions } from 'react-native';
import { useEffect, useState } from 'react';

import { DARK, LIGHT, type Palette } from './theme';

export const usePalette = (): Palette => {
  const scheme = useColorScheme();
  return scheme === 'dark' ? DARK : LIGHT;
};

export const useIsDark = (): boolean => useColorScheme() === 'dark';

/** Section 10.8: honour Reduce Motion by dropping springs to instant. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduced(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Compact phones get a shorter canvas card so the dock never gets clipped. */
export function useCompact(): boolean {
  const { height } = useWindowDimensions();
  return useMemo(() => height < 720, [height]);
}
