// Copies shared modules from packages/core into the Edge Functions folder (Supabase bundles only
// supabase/functions). Run after editing any of FILES: pnpm --filter @spotter/db sync-schemas
// Copied modules may only import zod (mapped in supabase/functions/deno.json) or each other.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILES = ['schemas.ts', 'platform.ts'];

let stale = false;
for (const name of FILES) {
  const src = fileURLToPath(new URL(`../../core/src/${name}`, import.meta.url));
  const out = fileURLToPath(new URL(`../supabase/functions/_shared/${name}`, import.meta.url));
  const body = `// GENERATED from packages/core/src/${name} by scripts/sync-schemas.mjs. Do not edit.\n` + readFileSync(src, 'utf8');
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(out, 'utf8');
    } catch {
      // missing counts as stale
    }
    if (current !== body) {
      console.error(`supabase/functions/_shared/${name} is out of date. Run: pnpm --filter @spotter/db sync-schemas`);
      stale = true;
    }
  } else {
    writeFileSync(out, body);
  }
}
if (stale) process.exit(1);
