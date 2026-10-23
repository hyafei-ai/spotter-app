import type { EaBand } from '@spotter/core';

/** The fuel check in plain words, before any number (docs/ux/client-experience.md). */
export const FUEL_PLAIN: Record<EaBand, string> = {
  adequate: 'Eating enough for your training',
  reduced: 'A bit under what training needs',
  low: 'Under what training needs on most days',
  unknown: 'Not enough food logged to say yet',
};
