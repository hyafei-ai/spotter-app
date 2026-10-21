import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Habit, MealPlan, NutritionTargets } from '@spotter/core';
import { DEMO_HABITS, DEMO_MEAL_PLAN, DEMO_NUTRITION_CLIENT_ID, DEMO_TARGETS } from '@spotter/core/demo';
import { kv } from '../storage';

/**
 * What the coach set for this client: targets and mode, the assigned meal plan, habit tasks.
 * Real builds read nutrition_targets, meal_plans and habits via GET /sync/pull.
 * MOCK: the demo reads what the coach app saved under `spotter.nutrition.*` (shared on the web
 * preview, which serves both apps from one origin), else the demo defaults.
 */
export const nutritionKeys = {
  targets: `spotter.nutrition.targets.${DEMO_NUTRITION_CLIENT_ID}`,
  mealPlan: `spotter.nutrition.mealplan.${DEMO_NUTRITION_CLIENT_ID}`,
  habits: `spotter.nutrition.habits.${DEMO_NUTRITION_CLIENT_ID}`,
};

export interface NutritionSetup {
  targets: NutritionTargets;
  mealPlan: MealPlan | null;
  habits: Habit[];
}

async function readJson<T>(key: string, parse: (v: unknown) => T | null, fallback: T): Promise<T> {
  try {
    const raw = await kv.getItem(key);
    if (raw == null) return fallback;
    return parse(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function loadNutritionSetup(): Promise<NutritionSetup> {
  const [targets, mealPlan, habits] = await Promise.all([
    readJson(nutritionKeys.targets, (v) => NutritionTargets.safeParse(v).data ?? null, DEMO_TARGETS),
    // An explicit null means the coach removed the plan.
    readJson<MealPlan | null>(nutritionKeys.mealPlan, (v) => (v === null ? null : (MealPlan.safeParse(v).data ?? null)), DEMO_MEAL_PLAN),
    readJson(nutritionKeys.habits, (v) => Habit.array().safeParse(v).data ?? null, DEMO_HABITS),
  ]);
  return { targets, mealPlan, habits };
}

/** Re-reads whenever the screen comes into focus, so coach edits show up without a restart. */
export function useNutritionSetup(): NutritionSetup | null {
  const [setup, setSetup] = useState<NutritionSetup | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadNutritionSetup().then((s) => live && setSetup(s));
      return () => {
        live = false;
      };
    }, []),
  );
  return setup;
}
