import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Skeleton, useTheme } from '@spotter/ui';
import { useAuth } from '@spotter/ui/platform';
import { useApp } from '../src/store';

export default function Index() {
  const { hydrated, intake, waiver, notificationsAsked } = useApp();
  const auth = useAuth();
  const { colors } = useTheme();
  if (!hydrated || auth.status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, padding: 20, gap: 12, paddingTop: 80 }} accessibilityLabel="Loading" accessibilityRole="progressbar">
        <Skeleton width="50%" height={28} />
        <Skeleton width="30%" />
      </View>
    );
  }
  // Connected builds need a session; demo builds run on sample data without one.
  if (auth.status === 'signedOut') return <Redirect href="/welcome" />;
  if (auth.status === 'expired') return <Redirect href="/sign-in?expired=1" />;
  if (!intake) return <Redirect href={auth.status === 'demo' ? '/welcome' : '/intake'} />;
  if (!waiver) return <Redirect href="/waiver" />;
  if (!notificationsAsked) return <Redirect href="/notifications" />;
  return <Redirect href="/today" />;
}
