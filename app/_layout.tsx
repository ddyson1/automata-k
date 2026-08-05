import { useEffect } from 'react';
import { AppState, Platform, View, type ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { flushPersist, useGame } from '../src/store/game';
import { usePalette } from '../src/ui/usePalette';

/**
 * Web gets the dynamic viewport height so the dock is never clipped by a
 * collapsing browser chrome. Native just fills.
 */
const ROOT: ViewStyle =
  Platform.OS === 'web'
    ? ({ height: '100dvh', width: '100%' } as unknown as ViewStyle)
    : { flex: 1 };

export default function RootLayout() {
  const palette = usePalette();
  const hydrate = useGame((s) => s.hydrate);
  const hydrated = useGame((s) => s.hydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Flush pending writes before the app leaves the foreground, so progress
  // survives a hard kill as well as a reload.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void flushPersist(useGame.getState());
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={ROOT}>
      <SafeAreaProvider>
        <View style={[{ flex: 1, backgroundColor: palette.ground }]}>
          <StatusBar style="auto" />
          {hydrated ? (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.ground },
                animation: Platform.OS === 'ios' ? 'default' : 'fade',
              }}
            />
          ) : null}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
