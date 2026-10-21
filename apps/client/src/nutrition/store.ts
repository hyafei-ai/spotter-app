import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  macrosFor,
  macrosFromPortions,
  portionsFromMacros,
  uuidv7,
  type Food,
  type FoodLogEntry,
  type Macros,
  type Meal,
  type MealPlanItem,
  type PortionKey,
  type Portions,
} from '@spotter/core';
import { kv } from '../storage';
import { syncQueue } from '../sync';

/** The client's own food log, favourites, recents and habit ticks. Every write is queued for sync first. */

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sensible default meal for the time of day. */
export function mealForNow(d = new Date()): Meal {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}

const RECENTS = 20;

interface NutritionState {
  entries: FoodLogEntry[];
  favourites: Food[];
  recents: Food[];
  /** date → habitId → done */
  habitChecks: Record<string, Record<string, boolean>>;

  logFood(food: Food, grams: number, meal: Meal, date?: string): Promise<FoodLogEntry>;
  logQuick(name: string, macros: Macros, meal: Meal, date?: string): Promise<FoodLogEntry>;
  logPortion(key: PortionKey, delta: 1 | -1, meal: Meal, date?: string): Promise<void>;
  logPlanned(items: MealPlanItem[], meal: Meal, date?: string): Promise<FoodLogEntry[]>;
  remove(id: string): Promise<FoodLogEntry | null>;
  restore(entry: FoodLogEntry): Promise<void>;
  toggleFavourite(food: Food): void;
  checkHabit(habitId: string, done: boolean, date?: string): Promise<void>;
  reset(): void;
}

async function queueLog(e: FoodLogEntry) {
  await syncQueue.enqueue('food.log', {
    logId: e.id,
    date: e.date,
    meal: e.meal,
    foodId: e.foodId,
    name: e.name,
    grams: e.grams,
    kcal: e.macros.kcal,
    proteinG: e.macros.proteinG,
    carbsG: e.macros.carbsG,
    fatG: e.macros.fatG,
    portions: e.portions,
    loggedAt: e.loggedAt,
  });
  void syncQueue.flush();
}

const PORTION_NAME: Record<PortionKey, string> = {
  protein: 'Palm of protein',
  carbs: 'Cupped hand of carbs',
  fat: 'Thumb of fats',
  veg: 'Fist of vegetables',
};

export const useNutrition = create<NutritionState>()(
  persist(
    (set, get) => {
      const add = async (e: FoodLogEntry) => {
        set({ entries: [...get().entries, e] });
        await queueLog(e);
        return e;
      };
      const entry = (meal: Meal, date: string, rest: Pick<FoodLogEntry, 'foodId' | 'name' | 'grams' | 'macros' | 'portions'>): FoodLogEntry => ({
        id: uuidv7(),
        date,
        meal,
        loggedAt: new Date().toISOString(),
        ...rest,
      });
      return {
        entries: [],
        favourites: [],
        recents: [],
        habitChecks: {},

        async logFood(food, grams, meal, date = localDate()) {
          const macros = macrosFor(food, grams);
          const e = entry(meal, date, { foodId: food.id, name: food.name, grams, macros, portions: portionsFromMacros(macros) });
          set({ recents: [food, ...get().recents.filter((f) => f.id !== food.id)].slice(0, RECENTS) });
          return add(e);
        },

        async logQuick(name, macros, meal, date = localDate()) {
          return add(entry(meal, date, { foodId: null, name, grams: null, macros, portions: portionsFromMacros(macros) }));
        },

        async logPortion(key, delta, meal, date = localDate()) {
          if (delta > 0) {
            const one: Portions = { protein: 0, carbs: 0, fat: 0, veg: 0, [key]: 1 };
            const macros = key === 'veg' ? { kcal: 25, proteinG: 2, carbsG: 5, fatG: 0 } : macrosFromPortions(one);
            await add(entry(meal, date, { foodId: `portion:${key}`, name: PORTION_NAME[key], grams: null, macros, portions: one }));
            return;
          }
          // Take back the most recent portion of this kind logged today.
          const last = [...get().entries].reverse().find((e) => e.date === date && e.foodId === `portion:${key}`);
          if (last) await get().remove(last.id);
        },

        async logPlanned(items, meal, date = localDate()) {
          const out: FoodLogEntry[] = [];
          for (const it of items) {
            out.push(await add(entry(meal, date, { foodId: it.foodId, name: it.name, grams: it.grams, macros: it.macros, portions: portionsFromMacros(it.macros) })));
          }
          return out;
        },

        async remove(id) {
          const e = get().entries.find((x) => x.id === id) ?? null;
          if (!e) return null;
          set({ entries: get().entries.filter((x) => x.id !== id) });
          await syncQueue.enqueue('food.delete', { logId: id, deletedAt: new Date().toISOString() });
          void syncQueue.flush();
          return e;
        },

        async restore(e) {
          // Undo after delete: log it again under a new id so the server's delete still stands.
          await add({ ...e, id: uuidv7(), loggedAt: new Date().toISOString() });
        },

        toggleFavourite(food) {
          const favs = get().favourites;
          set({ favourites: favs.some((f) => f.id === food.id) ? favs.filter((f) => f.id !== food.id) : [food, ...favs] });
        },

        async checkHabit(habitId, done, date = localDate()) {
          set({ habitChecks: { ...get().habitChecks, [date]: { ...get().habitChecks[date], [habitId]: done } } });
          await syncQueue.enqueue('habit.check', { habitId, date, done, checkedAt: new Date().toISOString() });
          void syncQueue.flush();
        },

        reset: () => set({ entries: [], favourites: [], recents: [], habitChecks: {} }),
      };
    },
    { name: 'spotter.nutrition.client', storage: createJSONStorage(() => kv) },
  ),
);
