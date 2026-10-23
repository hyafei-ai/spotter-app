import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme, space } from '@spotter/ui';

/** The one link every scattered sharing switch carries, so there's one place to check what the coach sees. */
export function WhoSeesLink({ label = 'Who sees what' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/sharing')}
      accessibilityRole="link"
      accessibilityHint="Opens the list of everything your coach can and can’t see"
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], alignSelf: 'flex-start', minHeight: 32 }}
    >
      <Feather name="eye" size={14} color={colors.brand} />
      <Text variant="callout" style={{ color: colors.brand, fontFamily: 'SourceSans3_600SemiBold' }}>
        {label}
      </Text>
    </Pressable>
  );
}
