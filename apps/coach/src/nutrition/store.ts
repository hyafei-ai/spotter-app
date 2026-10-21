import { create } from 'zustand';
import { FoodLogEntry, Habit, MealPlan, NutritionTargets } from '@spotter/core';
import { DEMO_HABITS, DEMO_MEAL_PLAN, DEMO_NUTRITION_CLIENT_ID, DEMO_TARGETS } from '@spotter/core/demo';

/*
 * Per-client nutrition setup from the coach side: targets and mode, meal plan, habits.
 * Real builds write nutrition_targets, meal_plans and habits (coach-only under RLS).
 * MOCK: the demo keeps them in localStorage under `spotter.nutrition.*`, which the client app on the
 * same origin (the web preview) reads; on native they live in memory for the session.
 */
export interface ClientNutrition {
  targets: NutritionTargets | null; // null = not set up yet
  mealPlan: MealPlan | null;
  habits: Habit[];
}

const ls = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);
export const keys = (clientId: string) => ({
  targets: `spotter.nutrition.targets.${clientId}`,
  mealPlan: `spotter.nutrition.mealplan.${clientId}`,
  habits: `spotter.nutrition.habits.${clientId}`,
});

function readKey<T>(key: string, parse: (v: unknown) => T | null): { found: boolean; value: T | null } {
  try {
    const raw = ls()?.getItem(key);
    if (raw == null) return { found: false, value: null };
    return { found: true, value: parse(JSON.parse(raw)) };
  } catch {
    return { found: false, value: null };
  }
}

function load(clientId: string): ClientNutrition {
  const k = keys(clientId);
  const demo = clientId === DEMO_NUTRITION_CLIENT_ID;
  const t = readKey(k.targets, (v) => NutritionTargets.safeParse(v).data ?? null);
  const p = readKey(k.mealPlan, (v) => (v === null ? null : (MealPlan.safeParse(v).data ?? null)));
  const h = readKey(k.habits, (v) => Habit.array().safeParse(v).data ?? null);
  return {
    targets: t.found ? t.value : demo ? DEMO_TARGETS : null,
    mealPlan: p.found ? p.value : demo ? DEMO_MEAL_PLAN : null,
    habits: h.found ? (h.value ?? []) : demo ? DEMO_HABITS : [],
  };
}

interface State {
  byClient: Record<string, ClientNutrition>;
  get(clientId: string): ClientNutrition;
  save(clientId: string, next: ClientNutrition): void;
}

export const useClientNutrition = create<State>((set, get) => ({
  byClient: {},
  get(clientId) {
    const cached = get().byClient[clientId];
    if (cached) return cached;
    const loaded = load(clientId);
    set({ byClient: { ...get().byClient, [clientId]: loaded } });
    return loaded;
  },
  save(clientId, next) {
    const k = keys(clientId);
    ls()?.setItem(k.targets, JSON.stringify(next.targets));
    ls()?.setItem(k.mealPlan, JSON.stringify(next.mealPlan));
    ls()?.setItem(k.habits, JSON.stringify(next.habits));
    set({ byClient: { ...get().byClient, [clientId]: next } });
  },
}));

/**
 * The client's own food log, for adherence. Real builds read food_logs (RLS: coaches who can see the
 * client). MOCK: on the web preview this reads the demo client's log from the shared origin.
 */
export function readClientLog(clientId: string): FoodLogEntry[] {
  if (clientId !== DEMO_NUTRITION_CLIENT_ID) return [];
  try {
    const raw = ls()?.getItem('spotter.nutrition.client');
    const entries = raw ? (JSON.parse(raw) as { state?: { entries?: unknown } }).state?.entries : null;
    return FoodLogEntry.array().safeParse(entries).data ?? [];
  } catch {
    return [];
  }
}
