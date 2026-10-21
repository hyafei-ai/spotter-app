import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { MEALS, MEAL_LABEL, Meal, kcalFromMacros, type Food, type Macros } from '@spotter/core';
import {
  Banner,
  Button,
  IconButton,
  ListRow,
  Screen,
  SegmentedControl,
  Text,
  TextField,
  haptic,
  useTheme,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { AmountSheet } from '../../src/nutrition/AmountSheet';
import { searchFood, type SearchResult } from '../../src/nutrition/foodSearch';
import { useNutritionSetup } from '../../src/nutrition/setup';
import { localDate, mealForNow, useNutrition } from '../../src/nutrition/store';
import { g, kcal } from '../../src/nutrition/format';

type Tab = 'recent' | 'favourites' | 'quick';

/** C-8 log food: search (Open Food Facts + USDA), recents, favourites and quick-add macros. */
export default function AddFood() {
  const params = useLocalSearchParams<{ date?: string; meal?: string; barcode?: string; quick?: string }>();
  const toast = useToast();
  const setup = useNutritionSetup();
  const date = params.date ?? localDate();
  const [meal, setMeal] = useState<Meal>(Meal.safeParse(params.meal).data ?? mealForNow());
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>(params.quick ? 'quick' : 'recent');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Food | null>(null);
  const { recents, favourites, logFood } = useNutrition();
  const seq = useRef(0);
  const showNumbers = setup?.targets.mode === 'macros';

  // Debounced search; only the latest query's result is shown.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      setSearching(true);
      void searchFood(q).then((r) => {
        if (n !== seq.current) return;
        setResult(r);
        setSearching(false);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const done = (message: string) => {
    toast({ message });
    if (router.canGoBack()) router.back();
    else router.replace('/nutrition');
  };

  const searchingNow = query.trim().length >= 2;
  const list = searchingNow ? (result?.foods ?? []) : tab === 'recent' ? recents : tab === 'favourites' ? favourites : [];

  return (
    <Screen
      banner={result && searchingNow && (result.kind === 'error' || result.offline) ? <Banner tone={result.kind === 'error' ? 'warning' : 'quiet'} message={result.kind === 'error' ? result.message : 'You’re offline. Showing foods you’ve logged before.'} /> : undefined}
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/nutrition'))} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Log food
        </Text>
        <SegmentedControl label="Meal" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />
        <TextField label="Search foods" value={query} onChangeText={setQuery} placeholder="e.g. chicken breast, oats, banana" autoCorrect={false} returnKeyType="search" />
        <View style={styles.scanRow}>
          <Button label="Scan a barcode" kind="quiet" icon="maximize" full={false} onPress={() => router.replace({ pathname: '/nutrition/scan', params: { date, meal } })} />
        </View>
      </View>

      {!searchingNow ? (
        <View style={styles.tabs}>
          <SegmentedControl<Tab>
            label="Show"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'favourites', label: 'Favourites' },
              { value: 'quick', label: 'Quick add' },
            ]}
          />
        </View>
      ) : null}

      {!searchingNow && tab === 'quick' ? (
        <QuickAdd
          meal={meal}
          showNumbers={setup?.targets.mode !== 'portions'}
          initialName={params.barcode ? `Barcode ${params.barcode}` : ''}
          onLogged={(name) => done(`Logged ${name}`)}
          date={date}
        />
      ) : searchingNow && searching && !result ? (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text color="ink2">Searching…</Text>
        </View>
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Text color="ink2">
            {searchingNow
              ? result?.kind === 'ok' && result.offline
                ? `No signal, so only foods you’ve logged before can be found. Add “${query.trim()}” yourself and it syncs later.`
                : `No foods match “${query.trim()}”. Check the spelling, or add it yourself.`
              : tab === 'recent'
                ? 'Foods you log show up here, so the second time takes one tap.'
                : 'Tap the star on a food to keep it here.'}
          </Text>
          {searchingNow ? <Button label="Quick add instead" kind="secondary" full={false} onPress={() => { setQuery(''); setTab('quick'); }} /> : null}
        </View>
      ) : (
        <View>
          {searching ? <ActivityIndicator style={{ paddingVertical: space[2] }} /> : null}
          {list.map((f, i) => (
            <FoodRow key={f.id} food={f} showNumbers={!!showNumbers} last={i === list.length - 1} onPress={() => setPicked(f)} />
          ))}
          {searchingNow && result?.kind === 'ok' && !result.offline ? (
            <Text variant="caption" color="ink2" style={styles.source}>
              From Open Food Facts and USDA FoodData Central. Check the label if a number looks off.
            </Text>
          ) : null}
        </View>
      )}

      <AmountSheet
        food={picked}
        mode={setup?.targets.mode ?? 'macros'}
        onClose={() => setPicked(null)}
        onLog={(grams) => {
          const f = picked!;
          haptic.success();
          setPicked(null);
          void logFood(f, grams, meal, date).then(() => done(`Logged ${f.name}, ${g(grams)}`));
        }}
      />
    </Screen>
  );
}

function FoodRow({ food, showNumbers, last, onPress }: { food: Food; showNumbers: boolean; last: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const fav = useNutrition((s) => s.favourites.some((f) => f.id === food.id));
  const toggle = useNutrition((s) => s.toggleFavourite);
  return (
    <ListRow
      title={food.name}
      subtitle={[food.brand, showNumbers ? `${kcal(food.per100g.kcal)} per 100 g` : null, food.servingG ? `serving ${g(food.servingG)}` : null].filter(Boolean).join(' · ') || undefined}
      onPress={onPress}
      accessibilityHint="Choose how much"
      last={last}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={fav ? `Remove ${food.name} from favourites` : `Add ${food.name} to favourites`} onPress={() => toggle(food)} hitSlop={4} style={styles.star}>
          <Feather name="star" size={20} color={fav ? colors.brand : colors.ink2} />
        </Pressable>
      }
    />
  );
}

function QuickAdd({ meal, date, showNumbers, initialName, onLogged }: { meal: Meal; date: string; showNumbers: boolean; initialName: string; onLogged: (name: string) => void }) {
  const logQuick = useNutrition((s) => s.logQuick);
  const [name, setName] = useState(initialName);
  const [v, setV] = useState({ kcal: '', proteinG: '', carbsG: '', fatG: '' });
  const n = (s: string) => {
    const x = Number(s.replace(',', '.'));
    return s.trim() === '' ? 0 : Number.isFinite(x) && x >= 0 ? x : NaN;
  };
  const macros: Macros = { kcal: n(v.kcal), proteinG: n(v.proteinG), carbsG: n(v.carbsG), fatG: n(v.fatG) };
  const invalid = Object.values(macros).some((x) => Number.isNaN(x));
  const fromMacros = useMemo(() => kcalFromMacros(macros.proteinG || 0, macros.carbsG || 0, macros.fatG || 0), [macros.proteinG, macros.carbsG, macros.fatG]);
  const finalMacros = { ...macros, kcal: macros.kcal || fromMacros };
  const missing = !name.trim() ? 'Give it a name' : invalid ? 'Numbers only, please' : finalMacros.kcal === 0 ? 'Add calories or macros' : null;
  const field = (key: keyof typeof v, label: string) => (
    <View style={{ flex: 1, minWidth: 140 }}>
      <TextField label={label} value={v[key]} onChangeText={(t) => setV({ ...v, [key]: t })} keyboardType="decimal-pad" inputMode="decimal" />
    </View>
  );
  return (
    <View style={styles.quick}>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Lunch at the café" />
      <View style={styles.grid}>
        {field('kcal', 'Calories (kcal)')}
        {field('proteinG', 'Protein (g)')}
        {field('carbsG', 'Carbs (g)')}
        {field('fatG', 'Fat (g)')}
      </View>
      {!v.kcal && fromMacros > 0 ? (
        <Text variant="caption" color="ink2">
          {`Calories worked out from the macros: ${kcal(fromMacros)}.`}
        </Text>
      ) : null}
      {!showNumbers ? (
        <Text variant="caption" color="ink2">
          Your coach uses hand portions, so these numbers stay private to your log.
        </Text>
      ) : null}
      <Button
        label={`Add to ${MEAL_LABEL[meal].toLowerCase()}`}
        disabled={!!missing}
        disabledReason={missing ?? undefined}
        onPress={() => {
          haptic.success();
          const label = name.trim();
          void logQuick(label, finalMacros, meal, date).then(() => onLogged(label));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[3] },
  scanRow: { flexDirection: 'row', marginTop: -space[2] },
  tabs: { paddingHorizontal: margin, paddingBottom: space[2] },
  loading: { flexDirection: 'row', gap: space[2], alignItems: 'center', padding: margin },
  empty: { paddingHorizontal: margin, paddingVertical: space[6], gap: space[4], alignItems: 'flex-start' },
  source: { paddingHorizontal: margin, paddingTop: space[3] },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  quick: { paddingHorizontal: margin, paddingTop: space[2], gap: space[4] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
});
