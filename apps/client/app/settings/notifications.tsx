import { router } from 'expo-router';
import { NotificationSettingsScreen } from '@spotter/ui/platform';
import { tenant } from '../../src/env';

export default function ClientNotificationSettings() {
  const first = tenant.coach.name.split(' ')[0];
  return (
    <NotificationSettingsScreen
      tenantId={tenant.id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/me'))}
      categories={[
        { category: 'coach_reply', label: `Replies from ${first}`, detail: 'Messages and voice notes' },
        { category: 'form_check_reply', label: 'Form check feedback', detail: `When ${first} has reviewed a video` },
        { category: 'check_in_due', label: 'Check-in reminders', detail: 'The morning a check-in is due' },
        { category: 'program_ready', label: 'New program', detail: 'When your next block is ready' },
        { category: 'rest_timer', label: 'Rest timer', detail: 'When your rest is up, if the app is in the background' },
        { category: 'payment', label: 'Billing', detail: 'Only when a payment needs your attention' },
      ]}
    />
  );
}
