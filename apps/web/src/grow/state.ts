import { DEMO_TENANTS } from '@spotter/core';

export { defaultGrow, growKey, type GrowState } from '@spotter/core/demo';

export function isDemoTenant(slug: string): boolean {
  return slug in DEMO_TENANTS;
}
