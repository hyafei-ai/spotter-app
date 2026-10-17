// Copies the shared Zod schemas into the Edge Functions folder (Supabase bundles only supabase/functions).
// Run after editing packages/core/src/schemas.ts: pnpm --filter @spotter/db sync-schemas
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../core/src/schemas.ts', import.meta.url));
const out = fileURLToPath(new URL('../supabase/functions/_shared/schemas.ts', import.meta.url));
const header = '// GENERATED from packages/core/src/schemas.ts by scripts/sync-schemas.mjs. Do not edit.\n';
const body = header + readFileSync(src, 'utf8');
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== body) {
    console.error('supabase/functions/_shared/schemas.ts is out of date. Run: pnpm --filter @spotter/db sync-schemas');
    process.exit(1);
  }
} else {
  writeFileSync(out, body);
}
