import { router } from 'expo-router';
import { NotificationSettingsScreen } from '@spotter/ui/platform';
import { tenant } from '../../src/env';

export default function CoachNotificationSettings() {
  return (
    <NotificationSettingsScreen
      tenantId={tenant.id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
      categories={[
        { category: 'client_message', label: 'Client messages', detail: 'New messages and voice notes' },
        { category: 'triage', label: 'Needs you', detail: 'Form checks, check-ins, PAR-Q flags and missed sessions' },
        { category: 'payment', label: 'Payments', detail: 'Failed payments and cancellations' },
      ]}
    />
  );
}
