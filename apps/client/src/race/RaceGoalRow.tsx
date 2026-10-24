import { router } from 'expo-router';
import { ListRow } from '@spotter/ui';
import { shortDate } from '../format';
import { useMyRaceGoal } from './store';

/** Me → Race goal. */
export function RaceGoalRow() {
  const { goal } = useMyRaceGoal();
  return (
    <ListRow
      title="Race goal"
      subtitle={goal ? `${goal.event} · ${shortDate(goal.date)}` : 'None set. Add one when you enter a race.'}
      chevron
      onPress={() => router.push('/race-goal')}
    />
  );
}
