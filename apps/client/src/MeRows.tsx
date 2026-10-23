import { HealthRow } from './health/HealthRow';
import { PlanRow, ReferralRow } from './billing/BillingRows';
import { SharedTrainerRow } from './SharedTrainerRow';
import { AccountRows } from './platform/AccountRows';
import { DailyCheckRow } from './daily/DailyCheckRow';

/**
 * Me is account only (docs/ux/client-experience.md). Body features (cycle, fuel, pain, recovery, mobility)
 * live on the Body tab; Progress lives on Train. Each section lists its rows here.
 */
export const ME_PLAN_ROWS: React.ComponentType[] = [PlanRow, ReferralRow, SharedTrainerRow];
export const ME_CONNECTION_ROWS: React.ComponentType[] = [HealthRow, DailyCheckRow];

export function MeRows({ rows }: { rows: React.ComponentType[] }) {
  return (
    <>
      {rows.map((Row, i) => (
        <Row key={i} />
      ))}
    </>
  );
}

/** Notifications, export, delete account, sign out: always last. */
export { AccountRows };
