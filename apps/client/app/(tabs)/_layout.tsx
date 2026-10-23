import { Platform, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tabLabels } from '@spotter/core';
import { fonts, useTheme } from '@spotter/ui';
import { tenant } from '../../src/env';

export default function TabsLayout() {
  const { colors } = useTheme();
  // Trainers can rename tabs within a fixed list (W-1 deep branding).
  const labels = tabLabels(tenant);
  // Train and Body are fixed for now (docs/ux/client-experience.md); a trainer's "Train" label for Today would clash.
  const today = labels.today === 'Train' ? 'Today' : labels.today;
  const icon = (name: keyof typeof Feather.glyphMap) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Feather name={name} size={22} color={color as string} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.ink2,
        // Web has no safe-area inset under the bar; give the labels room so descenders aren't clipped.
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line, ...(Platform.OS === 'web' ? { height: 72, paddingTop: 6, paddingBottom: 10 } : null) },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
      }}
    >
      <Tabs.Screen name="today" options={{ title: today, tabBarIcon: icon('sun') }} />
      <Tabs.Screen name="train" options={{ title: 'Train', tabBarIcon: icon('bar-chart-2') }} />
      <Tabs.Screen name="body" options={{ title: 'Body', tabBarIcon: icon('activity') }} />
      <Tabs.Screen name="coach" options={{ title: labels.coach, tabBarIcon: icon('message-square') }} />
      <Tabs.Screen name="me" options={{ title: labels.me, tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
