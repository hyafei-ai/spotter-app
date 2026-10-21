import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { macrosFor, portionsFromMacros, type Food, type NutritionMode } from '@spotter/core';
import { Button, Sheet, Stepper, Text, margin, space } from '@spotter/ui';
import { g, kcal, portionCount } from './format';

/** Choose an amount for a food, then log it. Starts at one serving when the source gives one. */
export function AmountSheet({ food, mode, onClose, onLog }: { food: Food | null; mode: NutritionMode; onClose: () => void; onLog: (grams: number) => void }) {
  return (
    <Sheet visible={!!food} title={food?.name ?? ''} onClose={onClose}>
      {food ? <AmountBody key={food.id} food={food} mode={mode} onLog={onLog} /> : null}
    </Sheet>
  );
}

function AmountBody({ food, mode, onLog }: { food: Food; mode: NutritionMode; onLog: (grams: number) => void }) {
  const [grams, setGrams] = useState(food.servingG ?? 100);
  const m = macrosFor(food, grams);
  const p = portionsFromMacros(m);
  const presets = [...new Set([food.servingG, 50, 100, 150, 200].filter((x): x is number => x != null))].slice(0, 4);
  return (
    <View style={styles.body}>
      {food.brand ? (
        <Text variant="callout" color="ink2">
          {food.brand}
        </Text>
      ) : null}
      <View style={styles.presets}>
        {presets.map((x) => (
          <View key={x} style={{ flexGrow: 1 }}>
            <Button label={x === food.servingG ? `1 serving · ${g(x)}` : g(x)} kind={x === grams ? 'primary' : 'secondary'} onPress={() => setGrams(x)} />
          </View>
        ))}
      </View>
      <Stepper label="Amount (g)" unitLabel="grams" value={grams} step={grams >= 100 ? 10 : 5} min={1} max={2000} onChange={setGrams} />
      {mode === 'macros' ? (
        <Text accessibilityLiveRegion="polite">
          {`${kcal(m.kcal)} · Protein ${g(m.proteinG)} · Carbs ${g(m.carbsG)} · Fat ${g(m.fatG)}`}
        </Text>
      ) : mode === 'portions' ? (
        <Text color="ink2" accessibilityLiveRegion="polite">
          {[p.protein ? portionCount('protein', p.protein) : null, p.carbs ? portionCount('carbs', p.carbs) : null, p.fat ? portionCount('fat', p.fat) : null].filter(Boolean).join(' · ') ||
            'Less than half a portion'}
        </Text>
      ) : null}
      <Button label={`Log ${g(grams)}`} onPress={() => onLog(grams)} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, gap: space[4], paddingBottom: space[2] },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
