import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  MEALS,
  MEAL_LABEL,
  PORTION_KEYS,
  PORTION_LABEL,
  formatNumber,
  kcalMismatch,
  macrosFor,
  macrosFromPortions,
  searchFoods,
  sumMacros,
  type Food,
  type Habit,
  type Macros,
  type Meal,
  type MealPlan,
  type NutritionMode,
  type Portions,
} from '@spotter/core';
import { DEMO_MEAL_PLAN, SAMPLE_FOODS } from '@spotter/core/demo';
import {
  Button,
  IconButton,
  ListRow,
  Screen,
  SectionLabel,
  SegmentedControl,
  Sheet,
  Stepper,
  Text,
  TextField,
  useTheme,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { useCoach } from '../../../src/store';
import { useClientNutrition, type ClientNutrition } from '../../../src/nutrition/store';
import { confirm } from '../../../src/confirm';

const MODE_HELP: Record<NutritionMode, string> = {
  macros: 'Calories and macros. The client logs food and sees numbers against these targets.',
  portions: 'Hand-size portions per day. The client counts palms, cupped hands, thumbs and fists; no numbers.',
  off: 'No food tracking. The client sees no numbers at all, only the habits you set.',
};
const DEFAULT_MACROS: Macros = { kcal: 2200, proteinG: 150, carbsG: 240, fatG: 70 };
const DEFAULT_PORTIONS: Portions = { protein: 6, carbs: 6, fat: 6, veg: 6 };
const MAX_HABITS = 8;

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Coach sets a client's nutrition (C-8): mode, targets, habits and a meal plan. */
export default function ClientNutritionEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const client = useCoach((s) => s.clients.find((c) => c.id === id));
  const { get, save } = useClientNutrition();
  const [initial] = useState(() => get(id));
  const [mode, setMode] = useState<NutritionMode>(initial.targets?.mode ?? 'macros');
  const [macros, setMacros] = useState<Record<keyof Macros, string>>(() => {
    const m = initial.targets?.macros ?? DEFAULT_MACROS;
    return { kcal: String(m.kcal), proteinG: String(m.proteinG), carbsG: String(m.carbsG), fatG: String(m.fatG) };
  });
  const [portions, setPortions] = useState<Portions>(initial.targets?.portions ?? DEFAULT_PORTIONS);
  const [habits, setHabits] = useState<Habit[]>(initial.habits);
  const [newHabit, setNewHabit] = useState('');
  const [plan, setPlan] = useState<MealPlan | null>(initial.mealPlan);
  const [addingTo, setAddingTo] = useState<Meal | null>(null);
  const [dirty, setDirty] = useState(!initial.targets);
  const first = client?.name.split(' ')[0] ?? 'The client';
  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setDirty(true);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/client/${id}`));
  const leave = () => (dirty ? confirm('Discard changes?', 'Your nutrition changes haven’t been saved.', 'Discard', back) : back());

  const parsed: Macros | null = (() => {
    const n = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
    const m = { kcal: n(macros.kcal), proteinG: n(macros.proteinG), carbsG: n(macros.carbsG), fatG: n(macros.fatG) };
    return Object.values(m).every((x) => Number.isFinite(x) && x >= 0) ? m : null;
  })();
  const mismatch = parsed ? kcalMismatch(parsed) : null;
  const problem =
    mode === 'macros' && !parsed
      ? 'Fill in calories and all three macros'
      : mode === 'macros' && parsed && parsed.kcal < 800
        ? 'Calories look too low; check the number'
        : plan && !plan.name.trim()
          ? 'Give the meal plan a name'
          : null;

  const onSave = () => {
    const next: ClientNutrition = {
      targets: {
        mode,
        macros: mode === 'macros' ? parsed : (initial.targets?.macros ?? null),
        portions: mode === 'portions' ? portions : (initial.targets?.portions ?? null),
      },
      mealPlan: plan ? { ...plan, name: plan.name.trim() } : null,
      habits,
    };
    save(id, next);
    setDirty(false);
    toast({ message: `Saved. ${first} sees this next time they open the app.` });
    back();
  };

  return (
    <Screen footer={<Button label="Save nutrition" onPress={onSave} disabled={!dirty || !!problem} disabledReason={problem ?? (!dirty ? 'No changes yet' : undefined)} />}>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={leave} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          {client?.name ?? 'Client'}
        </Text>
        <Text variant="title" accessibilityRole="header">
          Nutrition
        </Text>
      </View>

      <View style={styles.block}>
        <SegmentedControl<NutritionMode>
          label="Tracking mode"
          value={mode}
          onChange={touch(setMode)}
          options={[
            { value: 'macros', label: 'Macros' },
            { value: 'portions', label: 'Portions' },
            { value: 'off', label: 'Off' },
          ]}
        />
        <Text color="ink2">{MODE_HELP[mode]}</Text>
      </View>

      {mode === 'macros' ? (
        <View style={styles.block}>
          <View style={styles.grid}>
            {(
              [
                ['kcal', 'Calories (kcal)'],
                ['proteinG', 'Protein (g)'],
                ['carbsG', 'Carbs (g)'],
                ['fatG', 'Fat (g)'],
              ] as const
            ).map(([k, label]) => (
              <View key={k} style={styles.cell}>
                <TextField label={label} value={macros[k]} onChangeText={(t) => touch(setMacros)({ ...macros, [k]: t })} keyboardType="number-pad" inputMode="numeric" />
              </View>
            ))}
          </View>
          {mismatch != null ? (
            <View style={styles.mismatch}>
              <Text variant="callout" color="warning" style={{ flex: 1 }}>
                {`These macros add up to ${formatNumber(mismatch)} kcal, not ${formatNumber(parsed!.kcal)}.`}
              </Text>
              <Button label={`Use ${formatNumber(mismatch)}`} kind="quiet" full={false} onPress={() => touch(setMacros)({ ...macros, kcal: String(mismatch) })} />
            </View>
          ) : null}
        </View>
      ) : null}

      {mode === 'portions' ? (
        <View style={styles.block}>
          {PORTION_KEYS.map((k) => (
            <Stepper
              key={k}
              label={`${PORTION_LABEL[k].what} · ${PORTION_LABEL[k].units} a day`}
              unitLabel={PORTION_LABEL[k].units}
              value={portions[k]}
              step={1}
              max={20}
              onChange={(v) => touch(setPortions)({ ...portions, [k]: v })}
            />
          ))}
          <Text variant="caption" color="ink2">
            {`Roughly ${formatNumber(macrosFromPortions(portions).kcal)} kcal by the usual guide (a palm ≈ 25 g protein, a cupped hand ≈ 25 g carbs, a thumb ≈ 10 g fat). It varies with hand size.`}
          </Text>
        </View>
      ) : null}

      <SectionLabel right={<Text variant="caption" color="ink2">{`${habits.length} of ${MAX_HABITS}`}</Text>}>Habits</SectionLabel>
      {habits.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          {mode === 'off' ? 'With tracking off, habits are all the client sees. Add one or two.' : 'Optional. Small daily habits the client ticks off.'}
        </Text>
      ) : null}
      {habits.map((h, i) => (
        <ListRow
          key={h.id}
          title={h.title}
          last={i === habits.length - 1}
          right={<IconButton icon="x" label={`Remove habit: ${h.title}`} onPress={() => touch(setHabits)(habits.filter((x) => x.id !== h.id))} />}
        />
      ))}
      <View style={[styles.block, styles.addHabit]}>
        <View style={{ flex: 1 }}>
          <TextField label="New habit" value={newHabit} onChangeText={setNewHabit} placeholder="e.g. Walk 8,000 steps" maxLength={60} />
        </View>
        <Button
          label="Add"
          kind="secondary"
          full={false}
          disabled={!newHabit.trim() || habits.length >= MAX_HABITS}
          onPress={() => {
            touch(setHabits)([...habits, { id: uid(), title: newHabit.trim() }]);
            setNewHabit('');
          }}
        />
      </View>

      {mode !== 'off' ? (
        <>
          <SectionLabel right={plan ? <Text variant="bodyStrong" color="error" accessibilityRole="button" onPress={() => confirm('Remove meal plan?', `${first} won’t see a plan any more. Food they already logged stays.`, 'Remove', () => touch(setPlan)(null))}>Remove</Text> : undefined}>
            Meal plan
          </SectionLabel>
          {!plan ? (
            <View style={styles.block}>
              <Text color="ink2">Optional. A day of meals the client can log in one tap with “Log as planned”.</Text>
              <Button label="Start from the training-day template" kind="secondary" onPress={() => touch(setPlan)({ ...DEMO_MEAL_PLAN, id: uid() })} />
              <Button label="Start an empty plan" kind="quiet" onPress={() => touch(setPlan)({ id: uid(), name: 'Daily plan', meals: { breakfast: [], lunch: [], dinner: [], snack: [] } })} />
            </View>
          ) : (
            <PlanEditor plan={plan} showNumbers={mode === 'macros'} onChange={touch(setPlan)} onAdd={setAddingTo} />
          )}
        </>
      ) : null}

      <AddFoodSheet
        meal={addingTo}
        onClose={() => setAddingTo(null)}
        onAdd={(food, grams) => {
          if (!plan || !addingTo) return;
          touch(setPlan)({ ...plan, meals: { ...plan.meals, [addingTo]: [...plan.meals[addingTo], { foodId: food.id, name: food.name, grams, macros: macrosFor(food, grams) }] } });
          setAddingTo(null);
        }}
      />
    </Screen>
  );
}

function PlanEditor({ plan, showNumbers, onChange, onAdd }: { plan: MealPlan; showNumbers: boolean; onChange: (p: MealPlan) => void; onAdd: (m: Meal) => void }) {
  const { colors } = useTheme();
  const all = MEALS.flatMap((m) => plan.meals[m]);
  const total = sumMacros(all);
  return (
    <View>
      <View style={styles.block}>
        <TextField label="Plan name" value={plan.name} onChangeText={(name) => onChange({ ...plan, name })} maxLength={60} />
        {showNumbers && all.length ? (
          <Text variant="callout" color="ink2">
            {`Whole day: ${formatNumber(total.kcal)} kcal · P ${formatNumber(total.proteinG)} g · C ${formatNumber(total.carbsG)} g · F ${formatNumber(total.fatG)} g`}
          </Text>
        ) : null}
      </View>
      {MEALS.map((meal) => (
        <View key={meal}>
          <Text variant="label" color="ink2" style={styles.mealLabel}>
            {MEAL_LABEL[meal]}
          </Text>
          {plan.meals[meal].map((it, i) => (
            <View key={`${it.foodId}-${i}`} style={[styles.item, { borderBottomColor: colors.line }]}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{it.name}</Text>
                <Text variant="callout" color="ink2">
                  {[`${formatNumber(it.grams)} g`, showNumbers ? `${formatNumber(it.macros.kcal)} kcal` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <IconButton
                icon="x"
                label={`Remove ${it.name} from ${MEAL_LABEL[meal].toLowerCase()}`}
                onPress={() => onChange({ ...plan, meals: { ...plan.meals, [meal]: plan.meals[meal].filter((_, j) => j !== i) } })}
              />
            </View>
          ))}
          <View style={styles.addFood}>
            <Button label={`Add food to ${MEAL_LABEL[meal].toLowerCase()}`} kind="quiet" icon="plus" full={false} onPress={() => onAdd(meal)} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** MOCK: searches the bundled sample foods. Real builds use the same food-search Edge Function as the client app. */
function AddFoodSheet({ meal, onClose, onAdd }: { meal: Meal | null; onClose: () => void; onAdd: (food: Food, grams: number) => void }) {
  const [q, setQ] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);
  const results = q.trim().length >= 2 ? searchFoods(SAMPLE_FOODS, q, 8) : [];
  const close = () => {
    setQ('');
    setFood(null);
    onClose();
  };
  return (
    <Sheet visible={!!meal} title={meal ? `Add to ${MEAL_LABEL[meal].toLowerCase()}` : ''} onClose={close}>
      <View style={styles.sheet}>
        {food ? (
          <>
            <Text variant="headline">{food.name}</Text>
            <Stepper label="Amount (g)" unitLabel="grams" value={grams} step={10} min={5} max={2000} onChange={setGrams} />
            <Button
              label={`Add ${formatNumber(grams)} g`}
              onPress={() => {
                onAdd(food, grams);
                setQ('');
                setFood(null);
              }}
            />
            <Button label="Pick a different food" kind="quiet" onPress={() => setFood(null)} />
          </>
        ) : (
          <>
            <TextField label="Search foods" value={q} onChangeText={setQ} placeholder="e.g. oats" autoCorrect={false} />
            {q.trim().length >= 2 && results.length === 0 ? <Text color="ink2">{`No foods match “${q.trim()}”.`}</Text> : null}
          </>
        )}
      </View>
      {!food
        ? results.map((f, i) => (
            <ListRow
              key={f.id}
              title={f.name}
              subtitle={`${formatNumber(f.per100g.kcal)} kcal per 100 g`}
              last={i === results.length - 1}
              onPress={() => {
                setFood(f);
                setGrams(f.servingG ?? 100);
              }}
            />
          ))
        : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  block: { paddingHorizontal: margin, paddingTop: space[4], gap: space[3] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  cell: { flexGrow: 1, minWidth: 140 },
  mismatch: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
  addHabit: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  mealLabel: { paddingHorizontal: margin, paddingTop: space[4] },
  item: { flexDirection: 'row', alignItems: 'center', paddingLeft: margin, paddingRight: space[2], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  addFood: { paddingHorizontal: margin - space[2] },
  sheet: { paddingHorizontal: margin, gap: space[3], paddingBottom: space[2] },
});
