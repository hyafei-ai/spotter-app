import { z } from 'zod';

/**
 * Native nutrition (C-8). One Food shape for every source, the math the logger and coach views
 * share, and mappers for the two public food databases (Open Food Facts, USDA FoodData Central).
 * Self-contained (zod only) so the food-search Edge Function can use the same code.
 */

/* ---------- shapes ---------- */

export const Macros = z.object({
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});
export type Macros = z.infer<typeof Macros>;

export const FoodSource = z.enum(['off', 'usda', 'custom', 'sample']);
export type FoodSource = z.infer<typeof FoodSource>;

export const Food = z.object({
  /** `<source>:<source id>`, e.g. "off:3017620422003", "usda:2345678" */
  id: z.string().min(1),
  source: FoodSource,
  name: z.string().min(1),
  brand: z.string().nullable(),
  /** Normalised barcode (EAN-13, or EAN-8), when the product has one. */
  barcode: z.string().nullable(),
  /** One serving in grams, when the source gives one. */
  servingG: z.number().positive().nullable(),
  /** Nutrition per 100 g. */
  per100g: Macros,
});
export type Food = z.infer<typeof Food>;

export const NUTRITION_MODES = ['macros', 'portions', 'off'] as const;
export const NutritionMode = z.enum(NUTRITION_MODES);
export type NutritionMode = z.infer<typeof NutritionMode>;

/** Hand-size portions per day (a common coaching method for clients who don't count numbers). */
export const Portions = z.object({
  protein: z.number().min(0).max(20), // palms
  carbs: z.number().min(0).max(20), // cupped hands
  fat: z.number().min(0).max(20), // thumbs
  veg: z.number().min(0).max(20), // fists
});
export type Portions = z.infer<typeof Portions>;
export type PortionKey = keyof Portions;
export const PORTION_KEYS: PortionKey[] = ['protein', 'carbs', 'fat', 'veg'];

export const PORTION_LABEL: Record<PortionKey, { unit: string; units: string; what: string }> = {
  protein: { unit: 'palm', units: 'palms', what: 'Protein' },
  carbs: { unit: 'cupped hand', units: 'cupped hands', what: 'Carbs' },
  fat: { unit: 'thumb', units: 'thumbs', what: 'Fats' },
  veg: { unit: 'fist', units: 'fists', what: 'Vegetables' },
};

export const NutritionTargets = z.object({
  mode: NutritionMode,
  macros: Macros.nullable(),
  portions: Portions.nullable(),
});
export type NutritionTargets = z.infer<typeof NutritionTargets>;

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const Meal = z.enum(MEALS);
export type Meal = z.infer<typeof Meal>;
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

export const FoodLogEntry = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: Meal,
  foodId: z.string().nullable(),
  name: z.string().min(1).max(120),
  grams: z.number().min(0).nullable(),
  macros: Macros,
  /** Hand portions this entry counts as (portions mode). */
  portions: Portions.nullable(),
  loggedAt: z.string(),
});
export type FoodLogEntry = z.infer<typeof FoodLogEntry>;

export const MealPlanItem = z.object({ foodId: z.string(), name: z.string(), grams: z.number().positive(), macros: Macros });
export type MealPlanItem = z.infer<typeof MealPlanItem>;
export const MealPlan = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  meals: z.object({
    breakfast: z.array(MealPlanItem),
    lunch: z.array(MealPlanItem),
    dinner: z.array(MealPlanItem),
    snack: z.array(MealPlanItem),
  }),
});
export type MealPlan = z.infer<typeof MealPlan>;

export const Habit = z.object({ id: z.string(), title: z.string().trim().min(1).max(60) });
export type Habit = z.infer<typeof Habit>;

/* ---------- math ---------- */

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
export const ZERO_PORTIONS: Portions = { protein: 0, carbs: 0, fat: 0, veg: 0 };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Atwater factors: 4 kcal/g protein and carbs, 9 kcal/g fat. */
export function kcalFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
}

export function macrosFor(food: Pick<Food, 'per100g'>, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: Math.round(food.per100g.kcal * f),
    proteinG: r1(food.per100g.proteinG * f),
    carbsG: r1(food.per100g.carbsG * f),
    fatG: r1(food.per100g.fatG * f),
  };
}

export function sumMacros(items: { macros: Macros }[]): Macros {
  return items.reduce<Macros>(
    (t, { macros: m }) => ({
      kcal: t.kcal + m.kcal,
      proteinG: r1(t.proteinG + m.proteinG),
      carbsG: r1(t.carbsG + m.carbsG),
      fatG: r1(t.fatG + m.fatG),
    }),
    ZERO_MACROS,
  );
}

/**
 * Rough hand-portion guidance from macros: a palm of protein ≈ 25 g protein, a cupped hand of
 * carbs ≈ 25 g carbs, a thumb of fats ≈ 10 g fat. Rounded to the nearest half. This is guidance
 * for converting a logged food, not a measurement; vegetables are counted by the client directly.
 */
export function portionsFromMacros(m: Macros): Portions {
  const half = (n: number) => Math.round(n * 2) / 2;
  return { protein: half(m.proteinG / 25), carbs: half(m.carbsG / 25), fat: half(m.fatG / 10), veg: 0 };
}

export function sumPortions(items: { portions: Portions | null }[]): Portions {
  return items.reduce<Portions>(
    (t, { portions: p }) =>
      p ? { protein: t.protein + p.protein, carbs: t.carbs + p.carbs, fat: t.fat + p.fat, veg: t.veg + p.veg } : t,
    ZERO_PORTIONS,
  );
}

/** Rough kcal and macros from a portion target (same 25/25/10 g guide), for coaches who want a figure. */
export function macrosFromPortions(p: Portions): Macros {
  const proteinG = p.protein * 25;
  const carbsG = p.carbs * 25;
  const fatG = p.fat * 10;
  return { kcal: kcalFromMacros(proteinG, carbsG, fatG), proteinG, carbsG, fatG };
}

export function groupByMeal<T extends { meal: Meal }>(entries: T[]): Record<Meal, T[]> {
  const out: Record<Meal, T[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const e of entries) out[e.meal].push(e);
  return out;
}

/** Progress of a logged value against its target, for plain "1,240 of 2,300 kcal" lines. */
export function against(value: number, target: number): { value: number; target: number; left: number; over: number } {
  return { value, target, left: Math.max(0, target - value), over: Math.max(0, value - target) };
}

/** The kcal the macros add up to, when that's more than 5% (min 25 kcal) away from the kcal typed. */
export function kcalMismatch(m: Macros): number | null {
  const fromMacros = kcalFromMacros(m.proteinG, m.carbsG, m.fatG);
  return Math.abs(fromMacros - m.kcal) > Math.max(25, m.kcal * 0.05) ? fromMacros : null;
}

/* ---------- barcodes ---------- */

function checkDigitOk(digits: string): boolean {
  const body = digits.slice(0, -1);
  let sum = 0;
  // Weights alternate 3,1,3,… counting from the digit next to the check digit.
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/**
 * Normalises a scanned or typed barcode. UPC-A (12 digits) becomes EAN-13 with a leading 0, which is
 * how Open Food Facts keys US products; EAN-13 and EAN-8 pass through; a GTIN-14 with a leading 0
 * drops it. Returns null for anything that fails its check digit.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12) return checkDigitOk(digits) ? `0${digits}` : null;
  if (digits.length === 13 || digits.length === 8) return checkDigitOk(digits) ? digits : null;
  if (digits.length === 14 && digits.startsWith('0') && checkDigitOk(digits)) return digits.slice(1);
  return null;
}

/* ---------- source mappers ---------- */

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Open Food Facts product (API v2 `/api/v2/product/{code}` → `product`, or a search hit). */
export function mapOpenFoodFacts(p: unknown): Food | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const n = (o.nutriments ?? {}) as Record<string, unknown>;
  const name = String(o.product_name ?? o.generic_name ?? '').trim();
  const code = String(o.code ?? '').trim();
  const kj = num(n['energy_100g']);
  const kcal = num(n['energy-kcal_100g']) ?? (kj != null ? kj / 4.184 : null);
  const proteinG = num(n.proteins_100g);
  const carbsG = num(n.carbohydrates_100g);
  const fatG = num(n.fat_100g);
  if (!name || !code || kcal == null || proteinG == null || carbsG == null || fatG == null) return null;
  const brand = String(o.brands ?? '').split(',')[0]?.trim() || null;
  const serving = num(o.serving_quantity);
  return {
    id: `off:${code}`,
    source: 'off',
    name,
    brand,
    barcode: normalizeBarcode(code),
    servingG: serving != null && serving > 0 ? serving : null,
    per100g: { kcal: Math.round(kcal), proteinG: r1(proteinG), carbsG: r1(carbsG), fatG: r1(fatG) },
  };
}

/** USDA nutrient numbers (stable across databases) and the matching nutrient ids. */
const USDA_NUMBER_BY_ID: Record<string, string> = { '1008': '208', '2047': '957', '2048': '958', '1003': '203', '1005': '205', '1004': '204' };

/**
 * USDA FoodData Central search hit (`/fdc/v1/foods/search` → `foods[]`). Nutrient values in search
 * results are per 100 g for every data type.
 */
export function mapUsda(f: unknown): Food | null {
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  const nutrients = Array.isArray(o.foodNutrients) ? (o.foodNutrients as Record<string, unknown>[]) : [];
  const byNumber = new Map<string, number>();
  for (const x of nutrients) {
    const number = String(x.nutrientNumber ?? USDA_NUMBER_BY_ID[String(x.nutrientId ?? '')] ?? '');
    const value = num(x.value);
    if (!number || value == null || String(x.unitName ?? '').toUpperCase() === 'KJ') continue;
    if (!byNumber.has(number)) byNumber.set(number, value);
  }
  const kcal = byNumber.get('208') ?? byNumber.get('957') ?? byNumber.get('958') ?? null;
  const proteinG = byNumber.get('203') ?? null;
  const carbsG = byNumber.get('205') ?? null;
  const fatG = byNumber.get('204') ?? null;
  const id = num(o.fdcId);
  const name = String(o.description ?? '').trim();
  if (id == null || !name || kcal == null || proteinG == null || carbsG == null || fatG == null) return null;
  const servingUnit = String(o.servingSizeUnit ?? '').toLowerCase();
  const serving = num(o.servingSize);
  return {
    id: `usda:${id}`,
    source: 'usda',
    name: tidyUsdaName(name),
    brand: String(o.brandName ?? o.brandOwner ?? '').trim() || null,
    barcode: o.gtinUpc ? normalizeBarcode(String(o.gtinUpc)) : null,
    servingG: serving != null && serving > 0 && (servingUnit === 'g' || servingUnit === 'grm') ? serving : null,
    per100g: { kcal: Math.round(kcal), proteinG: r1(proteinG), carbsG: r1(carbsG), fatG: r1(fatG) },
  };
}

/** USDA descriptions are ALL CAPS for branded foods; make them readable. */
function tidyUsdaName(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

/** Dedupes by barcode (or id), keeping the first: callers put their preferred source first. */
export function mergeFoods(lists: Food[][]): Food[] {
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const f of lists.flat()) {
    const key = f.barcode ?? f.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** Simple ranking for local search: name starts with the query, then a word does, then contains. */
export function searchFoods(foods: Food[], query: string, limit = 25): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const word = new RegExp(`(^|[^a-z])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return foods
    .map((f) => {
      const n = `${f.name} ${f.brand ?? ''}`.toLowerCase();
      return { f, score: n.startsWith(q) ? 3 : word.test(n) ? 2 : n.includes(q) ? 1 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.f.name.length - b.f.name.length)
    .slice(0, limit)
    .map((x) => x.f);
}

/* ---------- Edge Function contract (POST /food-search) ---------- */

export const FoodSearchRequest = z.union([
  z.object({ query: z.string().trim().min(2).max(80) }),
  z.object({ barcode: z.string().trim().min(8).max(14) }),
]);
export type FoodSearchRequest = z.infer<typeof FoodSearchRequest>;

export const FoodSearchResponse = z.object({ foods: z.array(Food), source: z.enum(['cache', 'live']) });
export type FoodSearchResponse = z.infer<typeof FoodSearchResponse>;
