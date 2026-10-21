/*
 * MOCK DATA — the demo client's starting nutrition setup (what a coach might set), used until the
 * coach saves their own in the demo. Jordan Ellis is DEMO_CLIENTS[0] in the coach app and
 * DEMO_CLIENT in the client app; the coach-side id keys the shared demo storage.
 */
import { macrosFor, type Habit, type MealPlan, type NutritionTargets } from '../nutrition';
import { DEMO_CLIENTS } from './coach';
import { SAMPLE_FOODS } from './foods';

export const DEMO_NUTRITION_CLIENT_ID = DEMO_CLIENTS[0]!.id;

export const DEMO_TARGETS: NutritionTargets = {
  mode: 'macros',
  macros: { kcal: 2400, proteinG: 160, carbsG: 270, fatG: 75 },
  portions: { protein: 6, carbs: 6, fat: 6, veg: 6 },
};

export const DEMO_HABITS: Habit[] = [
  { id: 'steps', title: 'Walk 8,000 steps' },
  { id: 'sleep', title: 'In bed by 11 pm' },
  { id: 'water', title: 'Drink 2 litres of water' },
];

const item = (id: string, grams: number) => {
  const food = SAMPLE_FOODS.find((x) => x.id === `sample:${id}`)!;
  return { foodId: food.id, name: food.name, grams, macros: macrosFor(food, grams) };
};

export const DEMO_MEAL_PLAN: MealPlan = {
  id: 'plan-training-day',
  name: 'Training day',
  meals: {
    breakfast: [item('oats', 60), item('greek-yoghurt', 170), item('blueberries', 80)],
    lunch: [item('chicken-breast', 150), item('rice-white', 200), item('broccoli', 100)],
    dinner: [item('salmon', 130), item('potato', 250), item('spinach', 40)],
    snack: [item('banana', 120), item('peanut-butter', 16)],
  },
};
