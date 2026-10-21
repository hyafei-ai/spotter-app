import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { PORTION_KEYS, formatNumber, sumMacros, type FoodLogEntry } from '@spotter/core';
import { ListRow, SectionLabel, Text, useTheme } from '@spotter/ui';
import { readClientLog, useClientNutrition, type ClientNutrition } from './store';
import { portionsLine, targetsLine } from './format';

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** K-3 client detail → nutrition: mode and targets, today's log against them, habits, meal plan. */
export function NutritionSection({ clientId }: { clientId: string }) {
  const { colors } = useTheme();
  const getSetup = useClientNutrition((s) => s.get);
  const [setup, setSetup] = useState<ClientNutrition | null>(null);
  const [log, setLog] = useState<FoodLogEntry[]>([]);
  const [now, setNow] = useState(() => new Date());

  // Re-read on focus so edits made in the editor (and the client's latest log) show up.
  useFocusEffect(
    useCallback(() => {
      setSetup(getSetup(clientId));
      setLog(readClientLog(clientId));
      setNow(new Date());
    }, [clientId, getSetup]),
  );
  if (!setup) return null;

  const open = () => router.push(`/client/${clientId}/nutrition`);
  const edit = (
    <Text variant="bodyStrong" style={{ color: colors.brand }} accessibilityRole="button" onPress={open}>
      {setup.targets ? 'Edit' : 'Set up'}
    </Text>
  );

  if (!setup.targets) {
    return (
      <>
        <SectionLabel right={edit}>Nutrition</SectionLabel>
        <ListRow title="Not set up yet" subtitle="Set calorie and macro targets, hand portions, or habits only." chevron onPress={open} last />
      </>
    );
  }

  const today = localDate(now);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const todayLog = log.filter((e) => e.date === today);
  const loggedDays = new Set(log.filter((e) => e.date >= localDate(weekAgo) && e.date <= today).map((e) => e.date)).size;
  const t = setup.targets;
  let adherence: string | null = null;
  if (t.mode === 'macros' && t.macros) {
    const m = sumMacros(todayLog);
    adherence = todayLog.length ? `Today: ${formatNumber(m.kcal)} of ${formatNumber(t.macros.kcal)} kcal · ${formatNumber(m.proteinG)} of ${formatNumber(t.macros.proteinG)} g protein` : 'Nothing logged today';
  } else if (t.mode === 'portions') {
    adherence = todayLog.length ? `Today: ${todayLog.length} items logged` : 'Nothing logged today';
  }

  return (
    <>
      <SectionLabel right={edit}>Nutrition</SectionLabel>
      <ListRow
        title={t.mode === 'macros' ? 'Macros' : t.mode === 'portions' ? 'Hand portions' : 'Tracking off · habits only'}
        subtitle={t.mode === 'macros' ? targetsLine(t) : t.mode === 'portions' && t.portions ? portionsLine(t.portions, PORTION_KEYS) : 'The client sees no numbers, only the habits below.'}
        chevron
        onPress={open}
      />
      {t.mode !== 'off' ? (
        <ListRow title={adherence ?? 'No log yet'} subtitle={`Logged food on ${loggedDays} of the last 7 days`} />
      ) : null}
      <ListRow
        title={setup.habits.length ? `${setup.habits.length} habit${setup.habits.length === 1 ? '' : 's'}` : 'No habits'}
        subtitle={setup.habits.map((h) => h.title).join(' · ') || undefined}
        chevron
        onPress={open}
      />
      {t.mode !== 'off' ? <ListRow title={setup.mealPlan ? `Meal plan · ${setup.mealPlan.name}` : 'No meal plan'} chevron onPress={open} last /> : null}
    </>
  );
}
