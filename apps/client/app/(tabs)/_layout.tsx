import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, useTheme } from '@spotter/ui';
import { tenant } from '../../src/env';

export default function TabsLayout() {
  const { colors } = useTheme();
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
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('book-open') }} />
      <Tabs.Screen name="coach" options={{ title: tenant.coach.name.split(' ')[0] ?? 'Coach', tabBarIcon: icon('message-square') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
