// Copies shared, zod-only modules from packages/core into the Edge Functions folder
// (Supabase bundles only supabase/functions). Run after editing any of FILES:
//   pnpm --filter @spotter/db sync-schemas        (write)
//   node packages/db/scripts/sync-schemas.mjs --check   (CI: fail if out of date)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Each file must import nothing but zod, so it runs unchanged under Deno.
const FILES = ['schemas.ts', 'nutrition.ts'];

let stale = false;
for (const file of FILES) {
  const src = fileURLToPath(new URL(`../../core/src/${file}`, import.meta.url));
  const out = fileURLToPath(new URL(`../supabase/functions/_shared/${file}`, import.meta.url));
  const body = `// GENERATED from packages/core/src/${file} by scripts/sync-schemas.mjs. Do not edit.\n` + readFileSync(src, 'utf8');
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(out, 'utf8');
    } catch {
      // missing counts as stale
    }
    if (current !== body) {
      console.error(`supabase/functions/_shared/${file} is out of date. Run: pnpm --filter @spotter/db sync-schemas`);
      stale = true;
    }
  } else {
    writeFileSync(out, body);
  }
}
if (stale) process.exit(1);
