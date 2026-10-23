import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  MEAL_LABEL,
  MEALS,
  PORTION_KEYS,
  PORTION_LABEL,
  groupByMeal,
  intakeForDay,
  sumMacros,
  trainingDayTargetKcal,
  sumPortions,
  type FoodLogEntry,
  type Habit,
  type Macros,
  type Meal,
  type MealPlan,
  type NutritionTargets,
  type Portions,
} from '@spotter/core';
import { Button, IconButton, Screen, SectionLabel, Skeleton, Tag, Text, haptic, useTheme, useToast, margin, space } from '@spotter/ui';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { useNutritionSetup } from '../../src/nutrition/setup';
import { localDate, mealForNow, useNutrition } from '../../src/nutrition/store';
import { dayLabel, g, kcal, leftOrOver, portionCount, shiftDay } from '../../src/nutrition/format';
import { isOn } from '../../src/modules';
import { isFinishedToday, todayPlan, useApp } from '../../src/store';
import { useFuel } from '../../src/fuel/store';
import { healthProvider, useHealthIntake } from '../../src/fuel/healthIntake';
import { healthDay, sessionKcalFor, spotterDay } from '../../src/fuel/useFuelCheck';
import { FuelNutritionRow } from '../../src/fuel/FuelRows';

/** C-8 daily nutrition: logged food against the coach's targets, plus habits. Nutrition-off shows habits only. */
export default function Nutrition() {
  const setup = useNutritionSetup();
  const today = localDate();
  const [date, setDate] = useState(today);
  const entries = useNutrition((s) => s.entries);
  const day = useMemo(() => entries.filter((e) => e.date === date), [entries, date]);
  const first = tenant.coach.name.split(' ')[0];
  const fuel = useTrainingDayAndHealth(date, today, day);

  const back = (
    <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))} />
  );

  if (!setup) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <View style={[styles.head, { gap: space[3] }]}>
          <Skeleton width="45%" height={28} />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={40} />
          ))}
        </View>
      </Screen>
    );
  }

  const mode = setup.targets.mode;
  const isToday = date === today;

  return (
    <Screen
      banner={<SyncBanner />}
      footer={
        mode === 'off' ? undefined : (
          <View style={styles.footerRow}>
            <View style={{ flex: 1 }}>
              <Button label="Scan" accessibilityLabel="Scan a barcode" kind="secondary" icon="maximize" onPress={() => router.push({ pathname: '/nutrition/scan', params: { date } })} />
            </View>
            <View style={{ flex: 1.2 }}>
              <Button label="Log food" icon="plus" onPress={() => router.push({ pathname: '/nutrition/add', params: { date, meal: isToday ? mealForNow() : 'snack' } })} />
            </View>
          </View>
        )
      }
    >
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {mode === 'off' ? 'Habits' : 'Nutrition'}
        </Text>
        <View style={styles.dayRow}>
          <IconButton icon="chevron-left" label="Previous day" onPress={() => setDate(shiftDay(date, -1))} />
          <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }} accessibilityLiveRegion="polite">
            {dayLabel(date, today)}
          </Text>
          {isToday ? <View style={{ width: 48 }} /> : <IconButton icon="chevron-right" label="Next day" onPress={() => setDate(shiftDay(date, 1))} />}
        </View>
      </View>

      {mode !== 'off' && fuel.health ? <HealthTotals label={fuel.health.label} app={fuel.health.app} kcalTotal={fuel.health.macros.kcal} /> : null}
      {mode === 'macros' && setup.targets.macros && fuel.trainingKcal ? (
        <Text variant="callout" color="ink2" style={styles.body}>
          {`Training day: target +${kcal(trainingDayTargetKcal(setup.targets.macros.kcal, fuel.trainingKcal) - setup.targets.macros.kcal)} (estimated for ${fuel.finished ? 'the session you did' : 'today’s session'})`}
        </Text>
      ) : null}
      {mode !== 'off' && fuel.waiting ? (
        <View style={[styles.summary, { gap: space[1] }]} accessibilityLiveRegion="polite">
          <Text variant="bodyStrong">{`Waiting for ${fuel.waiting.app}`}</Text>
          <Text variant="callout" color="ink2">
            {`${fuel.waiting.app} hasn’t written today’s food to ${fuel.waiting.provider} yet. It shows here once it does, usually soon after you log a meal there. No need to log it twice.`}
          </Text>
          {mode === 'macros' && setup.targets.macros ? (
            <Text variant="caption" color="ink2">{`Today’s target: ${kcal(trainingDayTargetKcal(setup.targets.macros.kcal, fuel.trainingKcal))}`}</Text>
          ) : null}
        </View>
      ) : null}
      {mode === 'macros' && setup.targets.macros && !fuel.waiting ? (
        <MacroSummary
          logged={fuel.health?.macros ?? sumMacros(day)}
          target={{ ...setup.targets.macros, kcal: trainingDayTargetKcal(setup.targets.macros.kcal, fuel.trainingKcal) }}
        />
      ) : null}
      {mode !== 'off' && isOn('nutrition') && isToday ? <FuelNutritionRow /> : null}
      {mode === 'portions' && setup.targets.portions ? <PortionCounters logged={sumPortions(day)} target={setup.targets.portions} date={date} entries={day} /> : null}

      {mode !== 'off' ? (
        <>
          <MealsList day={day} mode={setup.targets.mode} date={date} />
          {setup.mealPlan && isToday ? <PlanSection targets={setup.targets} date={date} day={day} plan={setup.mealPlan} /> : null}
        </>
      ) : null}

      <Habits habits={setup.habits} date={date} coachName={first ?? 'your coach'} offMode={mode === 'off'} />
    </Screen>
  );
}

/**
 * Food already in the health store for this day (from apps like MyMacros), used instead of Spotter's
 * log when the fuel settings prefer it, and the extra energy a training day needs.
 */
function useTrainingDayAndHealth(date: string, today: string, day: FoodLogEntry[]) {
  const intakeSource = useFuel((s) => s.settings.intakeSource);
  const bodyweightKg = useFuel((s) => s.bodyweightKg);
  const { days, connected } = useHealthIntake();
  const completed = useApp((s) => s.completed);
  const todayMode = useApp((s) => s.demo.todayMode);
  return useMemo(() => {
    const h = healthDay(days, date);
    const chosen = intakeForDay(spotterDay(day, date), h, intakeSource, healthProvider());
    const health =
      chosen.source === 'health' && h
        ? { label: chosen.label ?? '', app: h.sources[0] ?? healthProvider(), macros: { kcal: Math.round(h.kcal), proteinG: h.proteinG, carbsG: h.carbsG, fatG: h.fatG } }
        : null;
    let trainingKcal: number | null = null;
    let finished = false;
    if (date === today) {
      const plan = todayPlan(todayMode);
      const done = isFinishedToday(completed, plan) ?? completed.find((s) => s.date === today);
      if (done) {
        finished = true;
        const minutes = Math.max(0, (Date.parse(done.finishedAt) - Date.parse(done.startedAt)) / 60_000);
        trainingKcal = sessionKcalFor(minutes, done.feel || null, bodyweightKg);
      } else if (plan) {
        trainingKcal = sessionKcalFor(null, null, bodyweightKg);
      }
    }
    // Food comes from another app via the health store, but that app hasn't written this day yet: say so
    // instead of showing "0 kcal" as if nothing was eaten.
    const knownApp = [...days].reverse().find((d) => d.sources.length)?.sources[0] ?? null;
    const waiting =
      !health && connected && intakeSource !== 'spotter' && knownApp && date === today && spotterDay(day, date) == null
        ? { app: knownApp, provider: healthProvider() }
        : null;
    return { health, trainingKcal, finished, waiting };
  }, [days, connected, date, today, day, intakeSource, bodyweightKg, completed, todayMode]);
}

function HealthTotals({ label, app, kcalTotal }: { label: string; app: string; kcalTotal: number }) {
  return (
    <View style={[styles.summary, { gap: space[1] }]} accessible accessibilityLabel={`${label}: ${kcal(kcalTotal)}. Logged in ${app}? It’s already here.`}>
      <Text variant="bodyStrong">{`${label}: ${kcal(kcalTotal)}`}</Text>
      <Text variant="caption" color="ink2">
        {`Logged in ${app}? It’s already here, so there’s no need to log it again. Logging in Spotter is optional.`}
      </Text>
    </View>
  );
}

function MacroSummary({ logged, target }: { logged: Macros; target: Macros }) {
  const rows: { label: string; value: number; target: number; unit: 'kcal' | 'g' }[] = [
    { label: 'Calories', value: logged.kcal, target: target.kcal, unit: 'kcal' },
    { label: 'Protein', value: logged.proteinG, target: target.proteinG, unit: 'g' },
    { label: 'Carbs', value: logged.carbsG, target: target.carbsG, unit: 'g' },
    { label: 'Fat', value: logged.fatG, target: target.fatG, unit: 'g' },
  ];
  return (
    <View style={styles.summary}>
      {rows.map((r) => (
        <TargetRow key={r.label} label={r.label} value={r.unit === 'kcal' ? kcal(r.value) : g(r.value)} of={r.unit === 'kcal' ? kcal(r.target) : g(r.target)} note={leftOrOver(r.value, r.target, r.unit)} over={r.value > r.target * 1.05} />
      ))}
    </View>
  );
}

function TargetRow({ label, value, of, note, over, right }: { label: string; value: string; of: string; note: string; over?: boolean; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.targetRow, { borderBottomColor: colors.line }]} accessible={!right} accessibilityLabel={`${label}: ${value} of ${of}. ${note}`}>
      <View style={{ flex: 1 }}>
        <Text variant="label" color="ink2">
          {label}
        </Text>
        <Text variant="figure" tabular>
          {value} <Text variant="callout" color="ink2">{`of ${of}`}</Text>
        </Text>
      </View>
      {right ?? (
        <Text variant="callout" color={over ? 'warning' : 'ink2'}>
          {note}
        </Text>
      )}
    </View>
  );
}

function PortionCounters({ logged, target, date, entries }: { logged: Portions; target: Portions; date: string; entries: FoodLogEntry[] }) {
  const { logPortion } = useNutrition();
  return (
    <View style={styles.summary}>
      <Text variant="callout" color="ink2" style={{ paddingBottom: space[2] }}>
        Count with your hand: a palm of protein, a cupped hand of carbs, a thumb of fats, a fist of vegetables.
      </Text>
      {PORTION_KEYS.map((k) => {
        const l = PORTION_LABEL[k];
        const manual = entries.some((e) => e.foodId === `portion:${k}`);
        return (
          <TargetRow
            key={k}
            label={l.what}
            value={portionCount(k, logged[k])}
            of={String(target[k])}
            note=""
            right={
              <View style={styles.counter}>
                {manual ? (
                  <IconButton icon="minus" label={`Remove one ${l.unit} of ${l.what.toLowerCase()}`} onPress={() => void logPortion(k, -1, mealForNow(), date).then(() => haptic.selection())} />
                ) : (
                  <View style={{ width: 48 }} />
                )}
                <IconButton icon="plus" label={`Add one ${l.unit} of ${l.what.toLowerCase()}`} onPress={() => void logPortion(k, 1, mealForNow(), date).then(() => haptic.selection())} />
              </View>
            }
          />
        );
      })}
    </View>
  );
}

function MealsList({ day, mode, date }: { day: FoodLogEntry[]; mode: NutritionTargets['mode']; date: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { remove, restore } = useNutrition();
  const byMeal = groupByMeal(day.filter((e) => !e.foodId?.startsWith('portion:')));
  return (
    <>
      {MEALS.map((meal) => {
        const items = byMeal[meal];
        const total = sumMacros(items);
        return (
          <View key={meal}>
            <SectionLabel right={mode === 'macros' && items.length ? <Text variant="caption" color="ink2">{kcal(total.kcal)}</Text> : undefined}>{MEAL_LABEL[meal]}</SectionLabel>
            {items.map((e) => (
              <View key={e.id} style={[styles.entry, { borderBottomColor: colors.line }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {e.name}
                  </Text>
                  <Text variant="callout" color="ink2">
                    {[e.grams != null ? g(e.grams) : null, mode === 'macros' ? `${kcal(e.macros.kcal)} · P ${g(e.macros.proteinG)} · C ${g(e.macros.carbsG)} · F ${g(e.macros.fatG)}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Quick add'}
                  </Text>
                </View>
                <IconButton
                  icon="x"
                  label={`Remove ${e.name}`}
                  onPress={() =>
                    void remove(e.id).then((removed) =>
                      removed ? toast({ message: `Removed ${removed.name}`, actionLabel: 'Undo', onAction: () => void restore(removed) }) : undefined,
                    )
                  }
                />
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add food to ${MEAL_LABEL[meal]}`}
              onPress={() => router.push({ pathname: '/nutrition/add', params: { date, meal } })}
              style={styles.addRow}
            >
              <Feather name="plus" size={16} color={colors.brand} />
              <Text variant="bodyStrong" style={{ color: colors.brand }}>
                Add to {MEAL_LABEL[meal].toLowerCase()}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

function PlanSection({ plan, date, day, targets }: { plan: MealPlan; date: string; day: FoodLogEntry[]; targets: NutritionTargets }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { logPlanned } = useNutrition();
  const logged = new Set(day.map((e) => `${e.meal}:${e.foodId}`));
  return (
    <>
      <SectionLabel>{`Meal plan · ${plan.name}`}</SectionLabel>
      {MEALS.map((meal: Meal) => {
        const items = plan.meals[meal];
        if (!items.length) return null;
        const done = items.every((it) => logged.has(`${meal}:${it.foodId}`));
        const total = sumMacros(items);
        return (
          <View key={meal} style={[styles.planRow, { borderBottomColor: colors.line }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{MEAL_LABEL[meal]}</Text>
              <Text variant="callout" color="ink2">
                {items.map((it) => `${it.name} ${g(it.grams)}`).join(', ')}
              </Text>
              {targets.mode === 'macros' ? (
                <Text variant="caption" color="ink2">
                  {kcal(total.kcal)}
                </Text>
              ) : null}
            </View>
            {done ? (
              <Tag label="Logged" tone="success" />
            ) : (
              <Button
                label="Log as planned"
                kind="secondary"
                full={false}
                onPress={() => {
                  haptic.success();
                  void logPlanned(items, meal, date).then(() => toast({ message: `${MEAL_LABEL[meal]} logged as planned` }));
                }}
              />
            )}
          </View>
        );
      })}
    </>
  );
}

function Habits({ habits, date, coachName, offMode }: { habits: Habit[]; date: string; coachName: string; offMode: boolean }) {
  const { colors } = useTheme();
  const checks = useNutrition((s) => s.habitChecks[date]);
  const checkHabit = useNutrition((s) => s.checkHabit);
  if (!habits.length) {
    return offMode ? (
      <Text color="ink2" style={styles.body}>
        {coachName} hasn’t set any habits yet. They’ll show up here.
      </Text>
    ) : null;
  }
  const done = habits.filter((h) => checks?.[h.id]).length;
  return (
    <>
      <SectionLabel right={<Text variant="caption" color="ink2">{`${done} of ${habits.length} done`}</Text>}>Habits</SectionLabel>
      {habits.map((h) => {
        const on = !!checks?.[h.id];
        return (
          <Pressable
            key={h.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={h.title}
            onPress={() => {
              if (!on) haptic.success();
              void checkHabit(h.id, !on, date);
            }}
            style={[styles.habit, { borderBottomColor: colors.line }]}
          >
            <View style={[styles.box, { borderColor: on ? colors.ink : colors.ink2, backgroundColor: on ? colors.ink : 'transparent' }]}>
              {on ? <Feather name="check" size={16} color={colors.paper} /> : null}
            </View>
            <Text style={{ flex: 1 }}>{h.title}</Text>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  dayRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -space[3] },
  summary: { paddingHorizontal: margin, paddingTop: space[2] },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  counter: { flexDirection: 'row' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingLeft: margin, paddingRight: space[2], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: margin, minHeight: 48 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  habit: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  box: { width: 24, height: 24, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: margin, paddingTop: space[4] },
  footerRow: { flexDirection: 'row', gap: space[3] },
});
