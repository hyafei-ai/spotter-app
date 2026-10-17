import { describe, expect, it } from 'vitest';
import { checkBrandColor, contrastRatio, deriveDarkBrand, onColor } from '../src/brand';
import { formatWeight, roundToIncrement, fromDisplay, toDisplay } from '../src/units';
import { uuidv7, UUID_RE } from '../src/ids';
import { buildTriage, reasonText } from '../src/triage';
import { demoTriage, DEMO_CLIENTS } from '../src/demo/coach';
import { DEMO_TENANTS, TenantConfig, resolveTenant } from '../src/tenant';
import { Mutation } from '../src/schemas';
import { DEMO_HISTORY } from '../src/demo/client';

const PAPER = '#F3EFE7';
const DARK_PAPER = '#171614';

describe('brand colour', () => {
  it('passes the default accent against paper', () => {
    expect(checkBrandColor('#C2410C', PAPER).ok).toBe(true);
  });
  it('suggests the nearest passing darker shade for a light colour', () => {
    const r = checkBrandColor('#F5A623', PAPER);
    expect(r.ok).toBe(false);
    expect(contrastRatio(r.suggestion, PAPER)).toBeGreaterThanOrEqual(4.5);
  });
  it('derives a passing dark-mode variant', () => {
    const d = deriveDarkBrand('#C2410C', DARK_PAPER);
    expect(contrastRatio(d, DARK_PAPER)).toBeGreaterThanOrEqual(4.5);
  });
  it('picks a readable label colour on brand fills', () => {
    expect(onColor('#C2410C')).toBe('#FFFFFF');
    expect(onColor('#F07A3E')).toBe('#1C1B18');
  });
  it('keeps every demo tenant AA-valid', () => {
    for (const t of Object.values(DEMO_TENANTS)) expect(checkBrandColor(t.brandColor, PAPER).ok).toBe(true);
  });
});

describe('spec colour tokens meet AA', () => {
  it.each([
    ['#1C1B18', '#F3EFE7'], ['#5D5A52', '#F3EFE7'], ['#5D5A52', '#FBF9F4'],
    ['#F1ECE2', '#171614'], ['#A8A296', '#171614'], ['#A8A296', '#211F1C'],
    ['#2F6B3F', '#F3EFE7'], ['#B3261E', '#F3EFE7'], ['#F2867E', '#171614'], ['#6FBF83', '#171614'],
  ])('%s on %s', (fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('units', () => {
  it('round-trips kg and lb', () => {
    expect(fromDisplay(toDisplay(100, 'lb'), 'lb')).toBeCloseTo(100, 6);
  });
  it('rounds to loadable increments without float noise', () => {
    expect(roundToIncrement(81.3, 2.5)).toBe(82.5);
    expect(formatWeight(82.5, 'kg')).toBe('82.5 kg');
    expect(formatWeight(100, 'lb', 5)).toBe('220 lb');
    expect(formatWeight(14, 'kg')).toBe('14 kg');
    expect(formatWeight(6240, 'kg')).toBe('6,240 kg');
    expect(formatWeight(100, 'lb')).toBe('220.5 lb');
  });
});

describe('uuidv7', () => {
  it('is valid, version 7 and sortable by time', () => {
    const a = uuidv7(1_000);
    const b = uuidv7(1_000);
    const c = uuidv7(2_000);
    for (const x of [a, b, c]) expect(x).toMatch(UUID_RE);
    expect(a[14]).toBe('7');
    expect(a < b && b < c).toBe(true);
  });
});

describe('triage', () => {
  it('orders clients by their most urgent reason', () => {
    const rows = buildTriage(demoTriage());
    const name = (id: string) => DEMO_CLIENTS.find((c) => c.id === id)!.name;
    expect(rows.map((r) => name(r.clientId)).slice(0, 3)).toEqual(['Priya Natarajan', 'Tomás Herrera-Vidal', 'Jordan Ellis']);
    expect(reasonText(rows[2]!.top)).toBe('Form check waiting 1 day');
  });
  it('hides handled and snoozed items', () => {
    const items = demoTriage().map((i) => ({ ...i, handledAt: '2026-10-17T00:00:00Z' }));
    expect(buildTriage(items)).toEqual([]);
    const snoozed = demoTriage().map((i) => ({ ...i, snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() }));
    expect(buildTriage(snoozed)).toEqual([]);
  });
});

describe('schemas', () => {
  it('validates demo tenants', () => {
    for (const t of Object.values(DEMO_TENANTS)) expect(() => TenantConfig.parse(t)).not.toThrow();
    expect(resolveTenant('nope').slug).toBe('maya-reyes-strength');
  });
  it('accepts a set.log mutation and rejects a malformed one', () => {
    const payload = DEMO_HISTORY[0]!.sets[0]!;
    const m = { clientMutationId: uuidv7(), createdAt: new Date().toISOString(), kind: 'set.log', payload };
    expect(Mutation.safeParse(m).success).toBe(true);
    expect(Mutation.safeParse({ ...m, payload: { ...payload, reps: -1 } }).success).toBe(false);
  });
});
