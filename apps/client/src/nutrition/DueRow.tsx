import { router } from 'expo-router';
import { PORTION_LABEL, formatNumber, sumMacros, sumPortions } from '@spotter/core';
import { ListRow } from '@spotter/ui';
import { useNutritionSetup } from './setup';
import { localDate, useNutrition } from './store';

/** Today "Due" row (C-3 / C-8). In nutrition-off mode it only ever talks about habits. */
export function NutritionDueRow() {
  const setup = useNutritionSetup();
  const today = localDate();
  const entries = useNutrition((s) => s.entries);
  const checks = useNutrition((s) => s.habitChecks[today]);
  if (!setup) return null;
  const day = entries.filter((e) => e.date === today);
  const habitsDone = setup.habits.filter((h) => checks?.[h.id]).length;
  const habitsLine = setup.habits.length ? `${habitsDone} of ${setup.habits.length} habits done` : null;

  let title = 'Nutrition';
  let subtitle: string | null;
  if (setup.targets.mode === 'off') {
    if (!setup.habits.length) return null;
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
      subtitle={[subtitle, setup.targets.mode !== 'off' ? habitsLine : null].filter(Boolean).join(' · ')}
      chevron
      onPress={() => router.push('/nutrition')}
      accessibilityHint="Opens today’s food log and habits"
    />
  );
}
