/*
 * MOCK DATA — a small generic food list so search and barcode flows work in the demo without a
 * server. Values are typical per-100 g figures for generic foods (rounded); no brands, no claims.
 * The barcodes are made-up demo codes in the GS1 "in-store" 20 prefix with valid check digits,
 * not real products. Real builds search Open Food Facts and USDA via the food-search Edge Function.
 */
import type { Food } from '../nutrition';

const f = (
  id: string,
  name: string,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  servingG: number | null = null,
  barcode: string | null = null,
): Food => ({ id: `sample:${id}`, source: 'sample', name, brand: null, barcode, servingG, per100g: { kcal, proteinG, carbsG, fatG } });

export const SAMPLE_FOODS: Food[] = [
  f('chicken-breast', 'Chicken breast, cooked', 165, 31, 0, 3.6, 120),
  f('salmon', 'Salmon fillet, baked', 206, 22, 0, 12, 130),
  f('beef-mince-5', 'Beef mince 5% fat, cooked', 170, 26, 0, 7, 125),
  f('tofu-firm', 'Tofu, firm', 144, 17, 3, 9, 100),
  f('eggs', 'Eggs, whole', 143, 12.6, 0.7, 9.5, 50, '2000000000015'),
  f('greek-yoghurt', 'Greek yoghurt, plain 0%', 59, 10, 3.6, 0.4, 170, '2000000000022'),
  f('cottage-cheese', 'Cottage cheese', 98, 11, 3.4, 4.3, 150),
  f('whey', 'Whey protein powder', 400, 78, 8, 6, 30, '2000000000039'),
  f('oats', 'Rolled oats, dry', 379, 13, 68, 6.5, 40, '2000000000046'),
  f('rice-white', 'White rice, cooked', 130, 2.7, 28, 0.3, 150),
  f('rice-brown', 'Brown rice, cooked', 123, 2.7, 26, 1, 150),
  f('pasta', 'Pasta, cooked', 158, 5.8, 31, 0.9, 180),
  f('bread-wholemeal', 'Wholemeal bread', 247, 13, 41, 3.4, 36, '2000000000053'),
  f('potato', 'Potato, boiled', 87, 1.9, 20, 0.1, 200),
  f('sweet-potato', 'Sweet potato, baked', 90, 2, 21, 0.2, 150),
  f('banana', 'Banana', 89, 1.1, 23, 0.3, 120),
  f('apple', 'Apple', 52, 0.3, 14, 0.2, 180),
  f('blueberries', 'Blueberries', 57, 0.7, 14, 0.3, 80),
  f('broccoli', 'Broccoli, steamed', 35, 2.4, 7, 0.4, 90),
  f('spinach', 'Spinach, raw', 23, 2.9, 3.6, 0.4, 30),
  f('peanut-butter', 'Peanut butter', 588, 25, 20, 50, 16, '2000000000060'),
  f('olive-oil', 'Olive oil', 884, 0, 0, 100, 10),
  f('almonds', 'Almonds', 579, 21, 22, 50, 28),
  f('avocado', 'Avocado', 160, 2, 8.5, 14.7, 75),
  f('milk-semi', 'Semi-skimmed milk', 47, 3.5, 4.8, 1.7, 250, '2000000000077'),
  f('cheddar', 'Cheddar cheese', 403, 25, 1.3, 33, 30),
  f('lentils', 'Lentils, boiled', 116, 9, 20, 0.4, 150),
  f('chickpeas', 'Chickpeas, canned, drained', 139, 7, 22, 2.6, 120),
];
