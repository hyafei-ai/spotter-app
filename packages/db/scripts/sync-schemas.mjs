// Copies shared core code into the Edge Functions folder (Supabase bundles only supabase/functions).
// Run after editing packages/core/src/{schemas,progression,ai}.ts: pnpm --filter @spotter/db sync-schemas
//   _shared/schemas.ts      — the Zod schemas (used by sync-push)
//   _shared/core/*.ts       — modules the AI and progression functions import; relative imports get
//                             a .ts extension because Deno requires one.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const core = (f) => fileURLToPath(new URL(`../../core/src/${f}`, import.meta.url));
const fn = (f) => fileURLToPath(new URL(`../supabase/functions/_shared/${f}`, import.meta.url));
const header = (f) => `// GENERATED from packages/core/src/${f} by scripts/sync-schemas.mjs. Do not edit.\n`;
const withExt = (src) => src.replace(/(from\s+'\.\/[a-z-]+)(')/gi, '$1.ts$2');

const outputs = [
  { out: fn('schemas.ts'), body: header('schemas.ts') + readFileSync(core('schemas.ts'), 'utf8') },
  ...['schemas.ts', 'progression.ts', 'ai.ts'].map((f) => ({
    out: fn(`core/${f}`),
    body: header(f) + withExt(readFileSync(core(f), 'utf8')),
  })),
];

if (process.argv.includes('--check')) {
  const stale = outputs.filter(({ out, body }) => {
    try {
      return readFileSync(out, 'utf8') !== body;
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.error(`Out of date: ${stale.map((s) => s.out).join(', ')}. Run: pnpm --filter @spotter/db sync-schemas`);
    process.exit(1);
  }
} else {
  mkdirSync(fn('core'), { recursive: true });
  for (const { out, body } of outputs) writeFileSync(out, body);
}
