// POST /food-search: food search and barcode lookup for the client app (C-8).
// Looks in the foods cache first, then Open Food Facts (barcodes and text) and USDA FoodData Central
// (text), maps both into one Food shape and caches what it finds. The USDA key stays in env.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (cache writes), USDA_API_KEY,
//      OFF_USER_AGENT (Open Food Facts asks for an identifying User-Agent, e.g. "Spotter/1.0 (ops@…)").
import { createClient } from '@supabase/supabase-js';
import { FoodSearchRequest, FoodSearchResponse, mapOpenFoodFacts, mapUsda, mergeFoods, normalizeBarcode, type Food } from '../_shared/nutrition.ts';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-client-info, apikey',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const CACHE_DAYS = 30;
const OFF = 'https://world.openfoodfacts.org';
const USDA = 'https://api.nal.usda.gov/fdc/v1/foods/search';

type Row = {
  id: string;
  source: 'off' | 'usda' | 'custom';
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_g: number | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fetched_at?: string;
};

const fromRow = (r: Row): Food => ({
  id: r.id,
  source: r.source,
  name: r.name,
  brand: r.brand,
  barcode: r.barcode,
  servingG: r.serving_g,
  per100g: { kcal: Number(r.kcal_100g), proteinG: Number(r.protein_100g), carbsG: Number(r.carbs_100g), fatG: Number(r.fat_100g) },
});
const toRow = (f: Food): Row => ({
  id: f.id,
  source: f.source === 'usda' ? 'usda' : 'off',
  name: f.name,
  brand: f.brand,
  barcode: f.barcode,
  serving_g: f.servingG,
  kcal_100g: f.per100g.kcal,
  protein_100g: f.per100g.proteinG,
  carbs_100g: f.per100g.carbsG,
  fat_100g: f.per100g.fatG,
  fetched_at: new Date().toISOString(),
});

async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null; // one source being down shouldn't fail the whole search
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const authorization = req.headers.get('authorization');
  if (!authorization) return json(401, { error: 'Sign in again to search foods.' });

  let parsed;
  try {
    parsed = FoodSearchRequest.safeParse(await req.json());
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  if (!parsed.success) return json(400, { error: 'Search for at least 2 characters, or send a barcode.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  // Reads go through the caller (RLS: signed-in only); cache writes use the service role.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const userAgent = Deno.env.get('OFF_USER_AGENT') ?? 'Spotter/1.0';
  const fresh = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();

  if ('barcode' in parsed.data) {
    const code = normalizeBarcode(parsed.data.barcode);
    if (!code) return json(400, { error: 'That barcode doesn’t look right. Try scanning again.' });
    const { data: cached, error } = await asUser.from('foods').select('*').eq('barcode', code).gte('fetched_at', fresh).limit(1);
    if (error) return json(401, { error: error.message });
    if (cached?.length) return json(200, FoodSearchResponse.parse({ foods: cached.map((r) => fromRow(r as Row)), source: 'cache' }));
    const body = (await fetchJson(`${OFF}/api/v2/product/${code}.json`, { headers: { 'user-agent': userAgent } })) as { product?: unknown } | null;
    const food = body?.product ? mapOpenFoodFacts(body.product) : null;
    if (food) await service.from('foods').upsert(toRow(food));
    return json(200, FoodSearchResponse.parse({ foods: food ? [food] : [], source: 'live' }));
  }

  const q = parsed.data.query;
  const { data: cached, error } = await asUser
    .from('foods')
    .select('*')
    .textSearch('name', q.split(/\s+/).join(' & '), { config: 'simple' })
    .gte('fetched_at', fresh)
    .limit(25);
  if (error) return json(401, { error: error.message });
  if ((cached?.length ?? 0) >= 10) return json(200, FoodSearchResponse.parse({ foods: cached!.map((r) => fromRow(r as Row)), source: 'cache' }));

  const usdaKey = Deno.env.get('USDA_API_KEY');
  const [usda, off] = await Promise.all([
    usdaKey
      ? fetchJson(`${USDA}?api_key=${usdaKey}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: q, pageSize: 20, dataType: ['Foundation', 'SR Legacy', 'Branded'] }),
        })
      : Promise.resolve(null),
    fetchJson(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=20`, { headers: { 'user-agent': userAgent } }),
  ]);
  const usdaFoods = ((usda as { foods?: unknown[] } | null)?.foods ?? []).map(mapUsda).filter((f): f is Food => f != null);
  const offFoods = ((off as { products?: unknown[] } | null)?.products ?? []).map(mapOpenFoodFacts).filter((f): f is Food => f != null);
  // Generic USDA foods first (they're what most people mean by "chicken breast"), then packaged products.
  const foods = mergeFoods([(cached ?? []).map((r) => fromRow(r as Row)), usdaFoods, offFoods]).slice(0, 30);
  const live = [...usdaFoods, ...offFoods];
  if (live.length) await service.from('foods').upsert(mergeFoods([live]).map(toRow));
  return json(200, FoodSearchResponse.parse({ foods, source: 'live' }));
});
