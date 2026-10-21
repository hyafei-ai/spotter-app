// Run with: node --experimental-strip-types --test supabase/functions/_shared/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signMux, verifyMuxSignature } from './mux.ts';

const secret = 'whsec_test';
const body = JSON.stringify({ type: 'video.asset.ready', data: { id: 'asset_1', passthrough: '0192f0a3-0000-7000-8000-000000000002' } });
const now = 1_792_300_000;

test('accepts a correctly signed, recent webhook', async () => {
  assert.equal(await verifyMuxSignature(await signMux(secret, body, now), body, secret, now + 10), true);
});

test('rejects a tampered body', async () => {
  assert.equal(await verifyMuxSignature(await signMux(secret, body, now), body.replace('asset_1', 'asset_2'), secret, now), false);
});

test('rejects the wrong secret', async () => {
  assert.equal(await verifyMuxSignature(await signMux('other', body, now), body, secret, now), false);
});

test('rejects old signatures (replay) and missing headers', async () => {
  assert.equal(await verifyMuxSignature(await signMux(secret, body, now), body, secret, now + 301), false);
  assert.equal(await verifyMuxSignature(null, body, secret, now), false);
  assert.equal(await verifyMuxSignature('t=abc,v1=00', body, secret, now), false);
});
