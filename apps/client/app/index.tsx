import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Skeleton, useTheme } from '@spotter/ui';
import { useApp } from '../src/store';

export default function Index() {
  const { hydrated, intake, waiver, notificationsAsked } = useApp();
  const { colors } = useTheme();
  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, padding: 20, gap: 12, paddingTop: 80 }}>
        <Skeleton width="50%" height={28} />
        <Skeleton width="30%" />
      </View>
    );
  }
  if (!intake) return <Redirect href="/welcome" />;
  if (!waiver) return <Redirect href="/waiver" />;
  if (!notificationsAsked) return <Redirect href="/notifications" />;
  return <Redirect href="/today" />;
}
