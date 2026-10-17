import { DEFAULT_INTAKE_FORM, IntakeForm } from '@spotter/core';
import { kv } from './storage';
import { tenant } from './env';

/**
 * The tenant's intake form. Real builds read the default row of `intake_forms` via GET /sync/pull.
 * MOCK: the demo reads the form the coach app saved on this device (on the web preview both apps
 * share an origin, so edits in the coach app show up here), else the starter form.
 */
export const INTAKE_FORM_KEY = `spotter.intakeForm.${tenant.slug}`;

export async function loadIntakeForm(): Promise<IntakeForm> {
  try {
    const raw = await kv.getItem(INTAKE_FORM_KEY);
    if (raw) {
      const parsed = IntakeForm.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Unreadable cache: fall back to the starter form rather than block onboarding.
  }
  return DEFAULT_INTAKE_FORM;
}
