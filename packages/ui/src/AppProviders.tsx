import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { SourceSans3_400Regular, SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3';
import { ThemeProvider, useTheme, type Theme } from './theme';
import { ToastProvider } from './components/Toast';
import type { TenantConfig } from '@spotter/core';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell({ children }: { children: ReactNode }) {
  const { colors, scheme }: Theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ToastProvider>{children}</ToastProvider>
    </View>
  );
}

/** Fonts, theme, safe areas and toasts; shared by the client and coach apps. */
export function AppProviders({ tenant, ready = true, children }: { tenant: TenantConfig; ready?: boolean; children: ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
  });
  const loaded = (fontsLoaded || !!fontError) && ready;
  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider tenant={tenant}>
          <Shell>{children}</Shell>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
