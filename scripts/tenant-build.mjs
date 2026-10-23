#!/usr/bin/env node
// Per-tenant EAS builds, updates and submissions (W-2). Two ways to run it:
//
//   node scripts/tenant-build.mjs --tenant maya-reyes-strength --kind build --platform ios [--dry-run]
//   node scripts/tenant-build.mjs --all --kind update --batch-size 5      # JS-only change for every tenant
//   node scripts/tenant-build.mjs --worker                                # process queued publish_jobs
//
// Tenants come from Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) or, without them, the demo JSON.
// Real builds need EXPO_TOKEN, and for store work the tenant's encrypted credentials plus CREDENTIALS_KEK.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(ROOT, 'apps/client');

function parseArgs(argv) {
  const a = { tenants: [], all: false, kind: 'build', platforms: ['ios', 'android'], batchSize: 5, dryRun: false, worker: false, message: 'Feature update' };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--tenant') a.tenants.push(argv[++i]);
    else if (v === '--all') a.all = true;
    else if (v === '--kind') a.kind = argv[++i];
    else if (v === '--platform') a.platforms = argv[++i] === 'all' ? ['ios', 'android'] : [argv[i]];
    else if (v === '--batch-size') a.batchSize = Math.max(1, Number(argv[++i]));
    else if (v === '--message') a.message = argv[++i];
    else if (v === '--dry-run') a.dryRun = true;
    else if (v === '--worker') a.worker = true;
    else throw new Error(`Unknown argument ${v}`);
  }
  if (!['build', 'update', 'submit'].includes(a.kind)) throw new Error('--kind must be build, update or submit');
  return a;
}

/* ---------- tenant source ---------- */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', prefer: 'return=representation', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Maps a `tenants` row to the TenantConfig shape app.config.ts reads. */
function fromRow(r) {
  return {
    id: r.id,
    slug: r.slug,
    appName: r.app_name,
    shortName: r.short_name,
    brandColor: r.brand_color,
    units: r.units,
    weightIncrement: Number(r.weight_increment),
    coach: r.coach_profile,
    supportEmail: r.support_email,
    privacyPolicyUrl: r.privacy_policy_url,
    modules: r.modules,
    bundleIds: r.bundle_ids,
    scheme: r.slug.replace(/-/g, ''),
    updateChannel: r.update_channel ?? r.slug,
    splashBackground: r.splash_background ?? undefined,
    tabs: Object.keys(r.tab_labels ?? {}).length ? r.tab_labels : undefined,
    easProjectId: r.eas_project_id ?? undefined,
  };
}

async function loadTenants(slugs, all) {
  if (SUPABASE_URL && SERVICE_KEY) {
    const filter = all ? '' : `&slug=in.(${slugs.join(',')})`;
    return (await rest(`tenants?select=*${filter}`)).map(fromRow);
  }
  // MOCK: demo tenants when no Supabase project is configured.
  const demo = JSON.parse(readFileSync(join(ROOT, 'packages/core/src/demo-tenants.json'), 'utf8'));
  return Object.values(demo).filter((t) => all || slugs.includes(t.slug));
}

/* ---------- credentials (envelope decryption, matches supabase/functions/_shared/envelope.ts) ---------- */

const unb64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));

async function openSealed(row) {
  const raw = process.env.CREDENTIALS_KEK;
  if (!raw) throw new Error('CREDENTIALS_KEK is not set');
  const kek = await crypto.subtle.importKey('raw', unb64(raw), { name: 'AES-KW' }, false, ['unwrapKey']);
  const dek = await crypto.subtle.unwrapKey('raw', unb64(row.wrapped_key), kek, { name: 'AES-KW' }, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.iv) }, dek, unb64(row.ciphertext));
  return Buffer.from(pt).toString('utf8');
}

/** Writes the tenant's store keys to a private temp dir and returns the env EAS expects. */
async function credentialEnv(tenant, platform, dir) {
  if (!SUPABASE_URL) return {};
  const rows = await rest(`store_credentials?select=*&tenant_id=eq.${tenant.id}&platform=eq.${platform}`);
  if (!rows.length) throw new Error(`${tenant.slug}: no ${platform} credentials uploaded`);
  const secret = await openSealed(rows[0]);
  if (platform === 'ios') {
    const p = join(dir, 'asc.p8');
    writeFileSync(p, secret, { mode: 0o600 });
    return { EXPO_ASC_API_KEY_PATH: p, EXPO_ASC_KEY_ID: rows[0].meta.keyId, EXPO_ASC_ISSUER_ID: rows[0].meta.issuerId };
  }
  // eas.json's submit profile reads the Play key from this fixed, gitignored path, so Android
  // submissions run one at a time (see androidSubmitLock) and the file is removed straight after.
  mkdirSync(join(CLIENT, '.secrets'), { recursive: true });
  writeFileSync(PLAY_KEY_PATH, secret, { mode: 0o600 });
  return {};
}

const PLAY_KEY_PATH = join(CLIENT, '.secrets', 'play-service-account.json');
let androidSubmitLock = Promise.resolve();

/* ---------- commands ---------- */

function commandFor(kind, platform, tenant, message) {
  if (kind === 'build') return ['npx', 'eas', 'build', '--profile', 'production', '--platform', platform, '--non-interactive', '--no-wait', '--json'];
  if (kind === 'update') return ['npx', 'eas', 'update', '--channel', tenant.updateChannel, '--message', message, '--non-interactive', '--json'];
  return ['npx', 'eas', 'submit', '--profile', 'production', '--platform', platform, '--latest', '--non-interactive'];
}

function run(cmd, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd: CLIENT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function runOne(tenant, platform, opts) {
  if (opts.kind === 'submit' && platform === 'android' && !opts.dryRun) {
    const prev = androidSubmitLock;
    let release;
    androidSubmitLock = new Promise((r) => (release = r));
    await prev;
    try {
      return await runOneUnlocked(tenant, platform, opts);
    } finally {
      rmSync(PLAY_KEY_PATH, { force: true });
      release();
    }
  }
  return runOneUnlocked(tenant, platform, opts);
}

/**
 * The trainer's Apple Watch app ships inside their iPhone app (docs/features/watch.md). For an iOS build: render
 * the tenant's icon at every watchOS size, check no watch surface says Spotter, and turn the watch plugin on
 * (SPOTTER_WATCH=1 → apps/client/plugins/withSpotterWatch.js). Opt out per tenant with `watch: false`.
 */
function watchStep(tenant, platform, kind, dryRun) {
  if (platform !== 'ios' || kind !== 'build' || tenant.watch === false) return {};
  const steps = [
    ['python3', ['scripts/make-tenant-icons.py', '--watch', tenant.slug]],
    ['node', ['scripts/check-watch-whitelabel.mjs']],
  ];
  for (const [bin, args] of steps) {
    if (dryRun) {
      console.log(`[dry-run] ${tenant.slug} ios watch: ${bin} ${args.join(' ')}`);
      continue;
    }
    const r = spawnSync(bin, args, { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${tenant.slug}: watch step failed (${bin} ${args.join(' ')})`);
  }
  return { SPOTTER_WATCH: '1' };
}

async function runOneUnlocked(tenant, platform, opts) {
  const dir = mkdtempSync(join(tmpdir(), `spotter-${tenant.slug}-`));
  try {
    const configPath = join(dir, 'tenant.json');
    writeFileSync(configPath, JSON.stringify(tenant));
    const env = { TENANT_ID: tenant.slug, TENANT_CONFIG_PATH: configPath, ...(tenant.easProjectId ? { EAS_PROJECT_ID: tenant.easProjectId } : {}) };
    Object.assign(env, watchStep(tenant, platform, opts.kind, opts.dryRun));
    // The watch plugin must also run on the EAS worker, so iOS builds with the watch use the profile that sets
    // SPOTTER_WATCH=1 there (eas.json "production-watch"), not only this shell's env.
    const cmd = commandFor(opts.kind, platform, tenant, opts.message).map((a) => (env.SPOTTER_WATCH && a === 'production' ? 'production-watch' : a));
    if (opts.dryRun) {
      console.log(`[dry-run] ${tenant.slug} ${platform}: TENANT_ID=${tenant.slug}${env.SPOTTER_WATCH ? ' SPOTTER_WATCH=1' : ''} ${cmd.join(' ')}`);
      return { ok: true, out: '' };
    }
    if (opts.kind !== 'update') Object.assign(env, await credentialEnv(tenant, platform, dir));
    const { code, out } = await run(cmd, env);
    return { ok: code === 0, out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Native rebuilds go out in batches so one bad tenant doesn't hold the rest, and EAS concurrency is respected. */
async function inBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}

async function cli(opts) {
  const tenants = await loadTenants(opts.tenants, opts.all);
  if (!tenants.length) throw new Error('No tenants matched.');
  // An update is per channel, not per platform.
  const platforms = opts.kind === 'update' ? ['all'] : opts.platforms;
  const work = tenants.flatMap((t) => platforms.map((p) => ({ t, p })));
  const results = await inBatches(work, opts.batchSize, async ({ t, p }) => ({ t, p, ...(await runOne(t, p, opts)) }));
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length} succeeded, ${failed.length} failed${failed.length ? `: ${failed.map((f) => `${f.t.slug}/${f.p}`).join(', ')}` : ''}`);
  process.exitCode = failed.length ? 1 : 0;
}

/** Worker: picks up jobs queued by the tenants-publish Edge Function. */
async function worker(opts) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('--worker needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const jobs = await rest('publish_jobs?select=*&status=eq.queued&order=created_at.asc&limit=20');
  for (const job of jobs) {
    // Claim the job; a concurrent worker that loses the race updates 0 rows and skips it.
    const claimed = await rest(`publish_jobs?id=eq.${job.id}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'running', started_at: new Date().toISOString() }) });
    if (!claimed.length) continue;
    const [tenant] = (await rest(`tenants?select=*&id=eq.${job.tenant_id}`)).map(fromRow);
    const r = await runOne(tenant, job.platform, { ...opts, kind: job.kind });
    let easBuildId = null;
    try {
      easBuildId = JSON.parse(r.out)?.[0]?.id ?? null;
    } catch {
      // not JSON (dry run or update); leave empty
    }
    await rest(`publish_jobs?id=eq.${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: r.ok ? 'succeeded' : 'failed',
        // After a build, the store status stays "building" until the submission reaches review.
        store_status: !r.ok ? 'draft' : job.kind === 'submit' ? 'in_review' : 'building',
        eas_build_id: easBuildId,
        finished_at: new Date().toISOString(),
      }),
    });
    console.log(`${tenant.slug} ${job.platform} ${job.kind}: ${r.ok ? 'ok' : 'failed'}`);
  }
}

const opts = parseArgs(process.argv.slice(2));
(opts.worker ? worker(opts) : cli(opts)).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
