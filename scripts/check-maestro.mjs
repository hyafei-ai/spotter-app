#!/usr/bin/env node
// Static check for the Maestro E2E flows in .maestro/: each file parses, has an appId header and a
// non-empty command list. The flows themselves run on a simulator/emulator (see docs/features/platform.md);
// CI has neither, so this catches broken YAML before someone tries to run them.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// js-yaml is already in the tree (via eslint); no new dependency.
const yaml = createRequire(import.meta.url)('js-yaml');
const dir = join(import.meta.dirname, '..', '.maestro');
const files = readdirSync(dir).filter((f) => f.endsWith('.yaml'));
let failed = 0;
for (const f of files) {
  try {
    const docs = yaml.loadAll(readFileSync(join(dir, f), 'utf8'));
    if (docs.length !== 2) throw new Error(`expected a header and a command list, found ${docs.length} documents`);
    const [header, commands] = docs;
    if (!header?.appId) throw new Error('header has no appId');
    if (!Array.isArray(commands) || commands.length === 0) throw new Error('no commands');
    console.log(`ok  ${f} (${commands.length} steps)`);
  } catch (e) {
    failed++;
    console.error(`bad ${f}: ${e.message}`);
  }
}
if (!files.length) {
  console.error('no flows found in .maestro/');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
