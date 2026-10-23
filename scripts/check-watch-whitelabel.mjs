#!/usr/bin/env node
// The watch app is the trainer's, not ours (docs/features/watch.md "White-label"). Fails if any user-visible
// watch surface could show Spotter, Station Zero or HybridFitness:
//   1. every string literal in the watch's Swift sources (apps/client/watch/**);
//   2. the Info.plists and entitlements the config plugin generates, for every demo tenant (names, permission
//      prompts, app group, the complication's name);
//   3. the bundle ids the plugin derives (the suffixes it adds; the tenant's own iPhone id is reported);
//   4. with --generated <ios/SpotterWatch dir>: every file `expo prebuild` actually wrote (plists, asset
//      catalogs, Swift), so the real build output is checked too.
// Usage: node scripts/check-watch-whitelabel.mjs [--generated apps/client/ios/SpotterWatch]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const plugin = require(join(ROOT, 'apps/client/plugins/withSpotterWatch.js'));
const FORBIDDEN = /spotter|station\s*zero|stationzero|hybrid\s*fitness|hybridfitness|delphiteam/i;

const problems = [];
const notes = [];
const flag = (where, text) => problems.push(`${where}: ${JSON.stringify(text.slice(0, 120))}`);

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// String literals in Swift, ignoring line and block comments.
function swiftStrings(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');
  return [...code.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]);
}

// 1. Swift sources.
const watchSrc = join(ROOT, 'apps/client/watch');
let literals = 0;
for (const f of walk(watchSrc).filter((f) => f.endsWith('.swift'))) {
  for (const s of swiftStrings(readFileSync(f, 'utf8'))) {
    literals++;
    if (FORBIDDEN.test(s)) flag(relative(ROOT, f), s);
  }
}

// 2 + 3. Generated plists and bundle ids, per demo tenant (the shared "Spotter" app is Spotter-branded on purpose
// and has no watch build).
const tenants = Object.values(JSON.parse(readFileSync(join(ROOT, 'packages/core/src/demo-tenants.json'), 'utf8')));
for (const t of tenants) {
  const spec = plugin.watchSpec({ extra: { tenant: t }, ios: { bundleIdentifier: t.bundleIds.ios }, version: '1.0.0' });
  const files = {
    'Info.plist': plugin.watchInfoPlist(spec),
    'Complication/Info.plist': plugin.extInfoPlist(spec),
    'Watch.entitlements': plugin.entitlements(spec, true),
  };
  for (const [name, text] of Object.entries(files)) {
    for (const m of text.matchAll(/<string>([^<]*)<\/string>/g)) {
      const value = m[1];
      // The app group and companion id carry the tenant's own iPhone bundle id (checked below, not here).
      const withoutTenantId = value.split(spec.phoneId).join('');
      if (FORBIDDEN.test(withoutTenantId)) flag(`${t.slug} ${name}`, value);
    }
  }
  for (const id of [spec.watchId, spec.extId, spec.appGroup]) {
    const added = id.replace(spec.phoneId, '');
    if (FORBIDDEN.test(added)) flag(`${t.slug} bundle id`, id);
  }
  if (FORBIDDEN.test(spec.phoneId)) {
    notes.push(`${t.slug}: the tenant's own iPhone bundle id (${spec.phoneId}) contains "spotter". Apple requires the watch ids to start with it, so they do too. Bundle ids aren't shown to users; real tenants get their own ids at onboarding.`);
  }
  if (spec.appName !== t.appName || !files['Info.plist'].includes(`<string>${t.appName}</string>`)) flag(`${t.slug} Info.plist`, 'display name is not the tenant’s app name');
}

// 4. What prebuild actually wrote.
const gi = process.argv.indexOf('--generated');
if (gi > 0) {
  const dir = process.argv[gi + 1];
  if (!dir || !existsSync(dir)) {
    console.error(`--generated: ${dir} not found (run SPOTTER_WATCH=1 npx expo prebuild -p ios first)`);
    process.exit(2);
  }
  const phoneId = (readFileSync(join(dir, 'Info.plist'), 'utf8').match(/<key>WKCompanionAppBundleIdentifier<\/key>\s*<string>([^<]+)</) ?? [])[1] ?? '\u0000';
  for (const f of walk(dir)) {
    if (/\.(plist|entitlements|json|strings)$/.test(f)) {
      const text = readFileSync(f, 'utf8').split(phoneId).join('');
      for (const m of text.matchAll(/<string>([^<]*)<\/string>|"([^"]*)"/g)) {
        const value = m[1] ?? m[2] ?? '';
        if (FORBIDDEN.test(value)) flag(relative(ROOT, f), value);
      }
    } else if (f.endsWith('.swift')) {
      for (const s of swiftStrings(readFileSync(f, 'utf8'))) if (FORBIDDEN.test(s)) flag(relative(ROOT, f), s);
    }
  }
}

for (const n of notes) console.log(`note: ${n}`);
if (problems.length) {
  console.error(`White-label check FAILED (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`White-label check passed: ${literals} Swift strings, ${tenants.length} tenants' plists and bundle ids${gi > 0 ? ', and the prebuild output' : ''} name no Spotter, Station Zero or HybridFitness.`);
