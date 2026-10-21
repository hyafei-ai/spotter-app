import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Skeleton, useTheme } from '@spotter/ui';
import { useApp } from '../src/store';
import { useRuntimeTenant } from '../src/runtimeTenant';

export default function Index() {
  const { hydrated, intake, waiver, notificationsAsked } = useApp();
  const { colors } = useTheme();
  const needsCode = useRuntimeTenant((s) => s.needsCode);
  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, padding: 20, gap: 12, paddingTop: 80 }}>
        <Skeleton width="50%" height={28} />
        <Skeleton width="30%" />
      </View>
    );
  }
  // Shared Spotter app: the trainer code comes before anything else.
  if (needsCode || !intake) return <Redirect href="/welcome" />;
  if (!waiver) return <Redirect href="/waiver" />;
  if (!notificationsAsked) return <Redirect href="/notifications" />;
  return <Redirect href="/today" />;
}
