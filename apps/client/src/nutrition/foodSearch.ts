import { FoodSearchResponse, normalizeBarcode, searchFoods, type Food } from '@spotter/core';
import { SAMPLE_FOODS } from '@spotter/core/demo';
import { useSync } from '../sync';
import { useNutrition } from './store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export type SearchResult =
  | { kind: 'ok'; foods: Food[]; offline: boolean }
  | { kind: 'error'; message: string; foods: Food[] };

/** Foods already on this phone (recents and favourites), searchable with no signal. */
function onPhone(): Food[] {
  const { recents, favourites } = useNutrition.getState();
  const seen = new Set<string>();
  return [...favourites, ...recents].filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

async function callEdge(body: { query: string } | { barcode: string }): Promise<Food[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/food-search`, {
    method: 'POST',
    // Auth token wiring lands with sign-in (platform build); the function rejects unauthenticated calls.
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Food search returned ${res.status}`);
  return FoodSearchResponse.parse(await res.json()).foods;
}

/**
 * Search Open Food Facts and USDA through the food-search Edge Function.
 * MOCK: without a Supabase project the demo searches a small bundled list of generic foods.
 * Offline, either way, it searches only foods already on the phone.
 */
export async function searchFood(query: string): Promise<SearchResult> {
  const local = searchFoods(onPhone(), query);
  if (!useSync.getState().online) return { kind: 'ok', foods: local, offline: true };
  if (!SUPABASE_URL) {
    await new Promise((r) => setTimeout(r, 150));
    return { kind: 'ok', foods: searchFoods([...onPhone(), ...SAMPLE_FOODS].filter(uniq()), query), offline: false };
  }
  try {
    const remote = await callEdge({ query });
    return { kind: 'ok', foods: [...local, ...remote].filter(uniq()), offline: false };
  } catch {
    return { kind: 'error', message: 'Food search isn’t responding. Showing foods on your phone.', foods: local };
  }
}

export type BarcodeResult =
  | { kind: 'found'; food: Food }
  | { kind: 'not_found'; code: string }
  | { kind: 'invalid' }
  | { kind: 'offline'; code: string }
  | { kind: 'error'; code: string; message: string };

export async function lookupBarcode(raw: string): Promise<BarcodeResult> {
  const code = normalizeBarcode(raw);
  if (!code) return { kind: 'invalid' };
  const local = onPhone().find((f) => f.barcode === code);
  if (local) return { kind: 'found', food: local };
  if (!useSync.getState().online) return { kind: 'offline', code };
  if (!SUPABASE_URL) {
    const sample = SAMPLE_FOODS.find((f) => f.barcode === code);
    return sample ? { kind: 'found', food: sample } : { kind: 'not_found', code };
  }
  try {
    const [food] = await callEdge({ barcode: code });
    return food ? { kind: 'found', food } : { kind: 'not_found', code };
  } catch {
    return { kind: 'error', code, message: 'Barcode lookup isn’t responding right now.' };
  }
}

function uniq() {
  const seen = new Set<string>();
  return (f: Food) => (seen.has(f.id) ? false : (seen.add(f.id), true));
}
