import { describe, expect, it } from 'vitest';
import offProduct from './fixtures/off-product.json';
import offSearch from './fixtures/off-search.json';
import usdaSearch from './fixtures/usda-search.json';
import {
  FoodSearchRequest,
  against,
  groupByMeal,
  kcalFromMacros,
  kcalMismatch,
  macrosFor,
  macrosFromPortions,
  mapOpenFoodFacts,
  mapUsda,
  mergeFoods,
  normalizeBarcode,
  portionsFromMacros,
  searchFoods,
  sumMacros,
  sumPortions,
  type Food,
} from '../src/nutrition';
import { SAMPLE_FOODS } from '../src/demo/foods';
import { DEMO_MEAL_PLAN } from '../src/demo/nutrition';
import { Mutation } from '../src/schemas';

describe('macros', () => {
  it('uses Atwater factors for kcal', () => {
    expect(kcalFromMacros(160, 270, 75)).toBe(2395);
  });

  it('scales per-100 g values to the logged amount', () => {
    const oats = SAMPLE_FOODS.find((f) => f.id === 'sample:oats')!;
    expect(macrosFor(oats, 60)).toEqual({ kcal: 227, proteinG: 7.8, carbsG: 40.8, fatG: 3.9 });
    expect(macrosFor(oats, 0)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('sums entries without float noise', () => {
    const t = sumMacros([{ macros: { kcal: 100, proteinG: 0.1, carbsG: 0.2, fatG: 0.3 } }, { macros: { kcal: 50, proteinG: 0.2, carbsG: 0.1, fatG: 0 } }]);
    expect(t).toEqual({ kcal: 150, proteinG: 0.3, carbsG: 0.3, fatG: 0.3 });
  });

  it('flags macro targets that don’t add up to the kcal target', () => {
    expect(kcalMismatch({ kcal: 2400, proteinG: 160, carbsG: 270, fatG: 75 })).toBeNull();
    expect(kcalMismatch({ kcal: 1800, proteinG: 160, carbsG: 270, fatG: 75 })).toBe(2395);
  });

  it('reports what is left and what is over, never negative', () => {
    expect(against(1240, 2300)).toEqual({ value: 1240, target: 2300, left: 1060, over: 0 });
    expect(against(2500, 2300)).toEqual({ value: 2500, target: 2300, left: 0, over: 200 });
  });

  it('groups by meal in a fixed order', () => {
    const g = groupByMeal([{ meal: 'dinner' as const, n: 1 }, { meal: 'breakfast' as const, n: 2 }]);
    expect(Object.keys(g)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(g.dinner).toHaveLength(1);
  });

  it('every demo meal-plan item matches its food’s numbers', () => {
    for (const items of Object.values(DEMO_MEAL_PLAN.meals)) {
      for (const it of items) {
        const food = SAMPLE_FOODS.find((f) => f.id === it.foodId)!;
        expect(it.macros).toEqual(macrosFor(food, it.grams));
      }
    }
  });
});

describe('hand portions', () => {
  it('converts macros to rounded half portions', () => {
    expect(portionsFromMacros({ kcal: 0, proteinG: 46, carbsG: 0, fatG: 5.4 })).toEqual({ protein: 2, carbs: 0, fat: 0.5, veg: 0 });
  });
  it('sums and skips entries without portions', () => {
    expect(sumPortions([{ portions: { protein: 1, carbs: 2, fat: 0.5, veg: 1 } }, { portions: null }])).toEqual({ protein: 1, carbs: 2, fat: 0.5, veg: 1 });
  });
  it('gives a rough macro figure from a portion target', () => {
    expect(macrosFromPortions({ protein: 6, carbs: 6, fat: 6, veg: 6 })).toEqual({ kcal: 1740, proteinG: 150, carbsG: 150, fatG: 60 });
  });
});

describe('barcodes', () => {
  it('passes valid EAN-13 and EAN-8 through', () => {
    expect(normalizeBarcode('5000000000012')).toBe('5000000000012');
    expect(normalizeBarcode('96385074')).toBe('96385074');
  });
  it('turns UPC-A into EAN-13 and strips spaces', () => {
    expect(normalizeBarcode('0 12345 67890 5')).toBe('0012345678905');
  });
  it('drops the leading 0 of a GTIN-14', () => {
    expect(normalizeBarcode('05000000000012')).toBe('5000000000012');
  });
  it('rejects bad check digits and odd lengths', () => {
    expect(normalizeBarcode('5000000000013')).toBeNull();
    expect(normalizeBarcode('12345')).toBeNull();
    expect(normalizeBarcode('')).toBeNull();
  });
});

describe('Open Food Facts mapping (fixtures)', () => {
  it('maps a product response', () => {
    expect(mapOpenFoodFacts(offProduct.product)).toEqual({
      id: 'off:5000000000012',
      source: 'off',
      name: 'Fixture oat bar',
      brand: 'Fixture Foods',
      barcode: '5000000000012',
      servingG: 40,
      per100g: { kcal: 435, proteinG: 11.2, carbsG: 52, fatG: 18.5 },
    });
  });
  it('converts kJ-only energy and skips products without nutrition', () => {
    const foods = offSearch.products.map(mapOpenFoodFacts);
    expect(foods[1]).toMatchObject({ brand: null, barcode: '0036000000009', servingG: null, per100g: { kcal: 47 } });
    expect(foods[2]).toBeNull();
  });
});

describe('USDA mapping (fixtures)', () => {
  it('maps foundation and branded foods, ignoring kJ rows', () => {
    const [lentils, bar, missing] = usdaSearch.foods.map(mapUsda);
    expect(lentils).toEqual({
      id: 'usda:100001',
      source: 'usda',
      name: 'Lentils, mature seeds, cooked, boiled',
      brand: null,
      barcode: null,
      servingG: null,
      per100g: { kcal: 116, proteinG: 9, carbsG: 20.1, fatG: 0.4 },
    });
    expect(bar).toMatchObject({ name: 'Fixture Protein Bar, Chocolate', brand: 'FIXTURE', barcode: '0012345678905', servingG: 60, per100g: { kcal: 370 } });
    expect(missing).toBeNull();
  });
});

describe('search', () => {
  it('ranks starts-with above word matches above contains', () => {
    const names = searchFoods(SAMPLE_FOODS, 'rice').map((f) => f.name);
    expect(names.slice(0, 2)).toEqual(['White rice, cooked', 'Brown rice, cooked']);
    // Both start with the query, so the shorter name comes first.
    expect(searchFoods(SAMPLE_FOODS, 'chick').map((f) => f.name)).toEqual(['Chicken breast, cooked', 'Chickpeas, canned, drained']);
    expect(searchFoods(SAMPLE_FOODS, 'yoghurt').map((f) => f.name)).toEqual(['Greek yoghurt, plain 0%']);
    expect(searchFoods(SAMPLE_FOODS, '  ')).toEqual([]);
  });
  it('dedupes across sources by barcode, keeping the first', () => {
    const a = mapOpenFoodFacts(offProduct.product)!;
    const b: Food = { ...a, id: 'usda:1', source: 'usda' };
    expect(mergeFoods([[a], [b, SAMPLE_FOODS[0]!]]).map((f) => f.id)).toEqual(['off:5000000000012', 'sample:chicken-breast']);
  });
  it('validates search requests', () => {
    expect(FoodSearchRequest.safeParse({ query: 'o' }).success).toBe(false);
    expect(FoodSearchRequest.safeParse({ barcode: '5000000000012' }).success).toBe(true);
  });
});

describe('nutrition mutations', () => {
  it('accepts a food log and a habit check', () => {
    const base = { clientMutationId: '0192f0a1-0000-7000-8000-000000000999', createdAt: '2026-10-21T08:00:00.000Z' };
    expect(
      Mutation.safeParse({
        ...base,
        kind: 'food.log',
        payload: { logId: '0192f0a1-0000-7000-8000-000000000998', date: '2026-10-21', meal: 'lunch', foodId: 'sample:oats', name: 'Oats', grams: 60, kcal: 227, proteinG: 7.8, carbsG: 40.8, fatG: 3.9, portions: null, loggedAt: '2026-10-21T08:00:00.000Z' },
      }).success,
    ).toBe(true);
    expect(Mutation.safeParse({ ...base, kind: 'habit.check', payload: { habitId: 'steps', date: '2026-10-21', done: true, checkedAt: '2026-10-21T08:00:00.000Z' } }).success).toBe(true);
  });
});
