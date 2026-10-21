import { router } from 'expo-router';
import { ListRow } from '@spotter/ui';
import { useDaily } from './store';

export const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

/** Me → Daily check settings: reminder, cycle tracking, default sharing. */
export function DailyCheckRow() {
  const s = useDaily((st) => st.settings);
  const parts = [s.reminderOn ? `Reminder at ${hourLabel(s.reminderHour)}` : 'No reminder', s.shareDefault ? 'Shared by default' : 'Private by default'];
  return <ListRow title="Daily check" subtitle={parts.join(' · ')} chevron onPress={() => router.push('/settings/daily-check')} />;
}
