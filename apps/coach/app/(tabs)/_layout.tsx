import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, useTheme } from '@spotter/ui';

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
      <Tabs.Screen name="clients" options={{ title: 'Clients', tabBarIcon: icon('users') }} />
      <Tabs.Screen name="programs" options={{ title: 'Programs', tabBarIcon: icon('clipboard') }} />
      <Tabs.Screen name="grow" options={{ title: 'Grow', tabBarIcon: icon('trending-up') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
