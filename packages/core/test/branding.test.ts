import { describe, expect, it } from 'vitest';
import {
  REJECTION_GUIDANCE,
  SHARED_TENANT,
  applyBrand,
  brandFromTenant,
  brandProblems,
  canSubmit,
  colorReport,
  demoTenantByCode,
  descriptionTemplate,
  iconProblems,
  logoProblems,
  moduleOn,
  normalizeJoinCode,
  privacyAnswers,
  publishChecklist,
  publishReadiness,
  screenshotPlan,
  tabLabels,
  unfilledPlaceholders,
  type PublishState,
} from '../src/branding';
import { DEMO_TENANTS, TenantConfig } from '../src/tenant';
import { StoreCredentialUpload, TenantsPublishRequest } from '../src/schemas';
import { contrastRatio } from '../src/brand';

const maya = DEMO_TENANTS['maya-reyes-strength']!;
const nsb = DEMO_TENANTS['north-shore-barbell']!;

describe('runtime branding', () => {
  it('uses the coach’s first name for the coach tab by default', () => {
    expect(tabLabels(maya)).toEqual({ today: 'Today', history: 'History', coach: 'Maya', me: 'Me' });
    expect(tabLabels(nsb)).toEqual({ today: 'Train', history: 'Log', coach: 'Coach', me: 'Profile' });
  });

  it('reads module switches', () => {
    expect(moduleOn(nsb, 'nutrition')).toBe(false);
    expect(moduleOn(maya, 'nutrition')).toBe(true);
  });

  it('keeps every demo tenant and the shared tenant valid', () => {
    for (const t of Object.values(DEMO_TENANTS)) expect(TenantConfig.safeParse(t).success).toBe(true);
    expect(SHARED_TENANT.slug).toBe('spotter');
  });
});

describe('trainer codes (shared app)', () => {
  it('normalises what clients type', () => {
    expect(normalizeJoinCode(' maya ')).toBe('MAYA');
    expect(normalizeJoinCode('nsb-2026')).toBe('NSB2026');
  });
  it('resolves demo codes and rejects unknown ones', () => {
    expect(demoTenantByCode('maya')?.slug).toBe('maya-reyes-strength');
    expect(demoTenantByCode('nsb 2026')?.slug).toBe('north-shore-barbell');
    expect(demoTenantByCode('NOPE')).toBeNull();
    expect(demoTenantByCode('')).toBeNull();
  });
});

describe('brand setup', () => {
  it('round-trips a tenant through the brand draft', () => {
    const b = brandFromTenant(maya);
    expect(brandProblems(b)).toEqual([]);
    expect(applyBrand(maya, b)).toMatchObject({ appName: maya.appName, brandColor: maya.brandColor, tabs: { coach: '{coach}' } });
  });

  it('explains every invalid field in plain words', () => {
    const b = { ...brandFromTenant(maya), appName: 'A'.repeat(31), shortName: '', brandColor: '#F5A623', supportEmail: 'nope', privacyPolicyUrl: 'http://x', welcomeMessage: ' ' };
    const fields = brandProblems(b).map((p) => p.field);
    expect(fields).toEqual(['appName', 'shortName', 'brandColor', 'welcomeMessage', 'supportEmail', 'privacyPolicyUrl']);
    expect(brandProblems(b).find((p) => p.field === 'brandColor')!.message).toMatch(/needs 4\.5:1\)\. Try #/);
  });

  it('refuses to apply an invalid brand', () => {
    const bad = { ...brandFromTenant(maya), appName: '' };
    expect(applyBrand(maya, bad)).toBe(maya);
  });

  it('switching units resets the plate increment', () => {
    expect(applyBrand(maya, { ...brandFromTenant(maya), units: 'lb' }).weightIncrement).toBe(5);
  });

  it('reports colour contrast, a passing suggestion and a passing dark shade', () => {
    const r = colorReport('#F5A623')!;
    expect(r.ok).toBe(false);
    expect(contrastRatio(r.suggestion, '#F3EFE7')).toBeGreaterThanOrEqual(4.5);
    expect(r.darkRatio).toBeGreaterThanOrEqual(4.5);
    expect(colorReport('red')).toBeNull();
  });
});

describe('image checks', () => {
  it('requires a 1024 PNG icon without transparency', () => {
    expect(iconProblems({ type: 'image/png', width: 1024, height: 1024, hasAlpha: false })).toEqual([]);
    expect(iconProblems({ type: 'image/jpeg', width: 512, height: 512, hasAlpha: true })).toHaveLength(3);
  });
  it('accepts SVG logos or large PNGs', () => {
    expect(logoProblems({ type: 'image/svg+xml', width: 0, height: 0 })).toEqual([]);
    expect(logoProblems({ type: 'image/png', width: 800, height: 1200 })).toEqual([]);
    expect(logoProblems({ type: 'image/png', width: 800, height: 600 })[0]).toMatch(/at least 1024/);
  });
});

describe('listing kit', () => {
  it('derives privacy answers from the modules that are on', () => {
    const on = privacyAnswers(maya);
    const off = privacyAnswers(nsb);
    expect(on.apple.flatMap((a) => a.items)).toContain('Food logs');
    expect(off.apple.flatMap((a) => a.items)).not.toContain('Food logs');
    expect(on.apple.every((a) => a.usedForTracking === false)).toBe(true);
    expect(on.google.every((g) => g.shared === false)).toBe(true);
  });

  it('leaves placeholders for anything we can’t know', () => {
    const d = descriptionTemplate(maya);
    expect(unfilledPlaceholders(d)).toHaveLength(3);
    expect(d).toContain('Track food');
    expect(descriptionTemplate(nsb)).not.toContain('Track food');
    expect(unfilledPlaceholders('All filled in.')).toEqual([]);
  });

  it('only plans screenshots for features that exist', () => {
    expect(screenshotPlan(nsb).map((s) => s.key)).not.toContain('nutrition');
    expect(screenshotPlan(maya).map((s) => s.key)).toContain('nutrition');
    expect(screenshotPlan(nsb).find((s) => s.key === 'history')!.screen).toBe('Log');
  });
});

describe('publishing', () => {
  const state: PublishState = {
    brandSaved: true,
    iconUploaded: false,
    logoUploaded: true,
    appleAccount: true,
    googleAccount: false,
    credentials: { ios: true, android: false },
    listingConfirmed: false,
    status: { ios: 'draft', android: 'draft' },
  };

  it('tracks the checklist', () => {
    const steps = publishChecklist(state);
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['brand', false],
      ['apple_account', true],
      ['google_account', false],
      ['credentials', false],
      ['listing', false],
      ['submit', false],
    ]);
  });

  it('blocks submission until assets, listing and the store’s keys are in place', () => {
    const brand = brandFromTenant(maya);
    const r = publishReadiness(state, brand, descriptionTemplate(maya));
    expect(r.missingAssets).toEqual(['App icon (1024 × 1024 PNG)']);
    expect(r.missingCredentials).toEqual(['android']);
    expect(r.listing).toHaveLength(4);
    expect(canSubmit(r, 'ios')).toBe(false);
    const ready = publishReadiness({ ...state, iconUploaded: true, listingConfirmed: true }, brand, 'Filled in.');
    expect(canSubmit(ready, 'ios')).toBe(true);
    expect(canSubmit(ready, 'android')).toBe(false);
  });

  it('has guidance for the common rejections', () => {
    expect(REJECTION_GUIDANCE.template_4_2_6!.fix).toMatch(/own developer account/);
  });
});

describe('publishing inputs', () => {
  it('validates credential uploads', () => {
    expect(StoreCredentialUpload.safeParse({ platform: 'ios', keyId: 'ABC123DEF4', issuerId: '57246542-96fe-1a63-e053-0824d011072a', privateKeyP8: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----' }).success).toBe(true);
    expect(StoreCredentialUpload.safeParse({ platform: 'ios', keyId: 'abc', issuerId: 'x', privateKeyP8: 'x' }).success).toBe(false);
    const sa = JSON.stringify({ type: 'service_account', client_email: 'a@b.iam.gserviceaccount.com', private_key: 'k' });
    expect(StoreCredentialUpload.safeParse({ platform: 'android', serviceAccountJson: sa }).success).toBe(true);
    expect(StoreCredentialUpload.safeParse({ platform: 'android', serviceAccountJson: '{}' }).success).toBe(false);
    expect(TenantsPublishRequest.safeParse({ platforms: [], kind: 'build' }).success).toBe(false);
  });
});
