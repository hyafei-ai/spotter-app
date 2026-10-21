import { router } from 'expo-router';
import { PORTION_LABEL, formatNumber, sumMacros, sumPortions } from '@spotter/core';
import { ListRow } from '@spotter/ui';
import { useNutritionSetup } from './setup';
import { localDate, useNutrition } from './store';
import { useDueVisible } from '../DueItems';
import { isOn } from '../modules';

/** Today "Due" row (C-3 / C-8). In nutrition-off mode it only ever talks about habits. */
export function NutritionDueRow() {
  const setup = useNutritionSetup();
  const today = localDate();
  const entries = useNutrition((s) => s.entries);
  const checks = useNutrition((s) => s.habitChecks[today]);
  // Tracking off (per client) or the Nutrition module off (per trainer) leaves habits only.
  const off = !setup || setup.targets.mode === 'off' || !isOn('nutrition');
  const habitsOnly = off && !!setup && isOn('habits') && setup.habits.length > 0;
  useDueVisible(!!setup && (!off || habitsOnly));
  if (!setup || (off && !habitsOnly)) return null;
  const day = entries.filter((e) => e.date === today);
  const habitsDone = setup.habits.filter((h) => checks?.[h.id]).length;
  const habitsLine = setup.habits.length
    ? `${habitsDone} of ${setup.habits.length} habits done`
    : null;

  let title = 'Nutrition';
  let subtitle: string | null;
  if (off) {
    title = 'Habits';
    subtitle = habitsLine;
  } else if (setup.targets.mode === 'portions' && setup.targets.portions) {
    const p = sumPortions(day);
    subtitle = `${formatNumber(p.protein)} of ${setup.targets.portions.protein} ${PORTION_LABEL.protein.units} of protein`;
  } else if (setup.targets.macros) {
    const m = sumMacros(day);
    subtitle = `${formatNumber(m.kcal)} of ${formatNumber(setup.targets.macros.kcal)} kcal logged`;
  } else {
    subtitle = day.length ? `${day.length} foods logged` : 'Nothing logged yet';
  }
  return (
    <ListRow
      title={title}
      subtitle={[subtitle, !off && isOn('habits') ? habitsLine : null].filter(Boolean).join(' · ')}
      chevron
      onPress={() => router.push('/nutrition')}
      accessibilityHint="Opens today’s food log and habits"
    />
  );
}
