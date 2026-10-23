import { router } from 'expo-router';
import { ongoingPain } from '@spotter/core';
import { ListRow } from '@spotter/ui';
import { localDate } from '../nutrition/store';
import { useInjury } from '../injury/store';
import { painLabel } from '../injury/PainCheck';

/** Me → Pain & injuries. */
export function PainRow() {
  const logs = useInjury((s) => s.logs);
  const ongoing = ongoingPain(logs, localDate());
  const last = logs[logs.length - 1];
  const subtitle = ongoing.length ? `Ongoing: ${ongoing.map((p) => p.region.replace('_', ' ')).join(', ')}` : last ? `Last: ${painLabel(last)}` : 'Nothing logged';
  return <ListRow title="Pain & injuries" subtitle={subtitle} chevron onPress={() => router.push('/pain')} />;
}

/** Me → Progress (wins beyond raw PRs). */
export function ProgressRow() {
  return <ListRow title="Progress" subtitle="Rep bests, trends and consistency" chevron onPress={() => router.push('/progress')} />;
}
