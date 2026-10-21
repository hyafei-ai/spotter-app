import { HealthRow } from './health/HealthRow';
import { PlanRow, ReferralRow } from './billing/BillingRows';
import { SharedTrainerRow } from './SharedTrainerRow';
import { AccountRows } from './platform/AccountRows';

/**
 * Extra rows on the client's Me tab (C-10): health app, billing, export, delete, etc.
 * Each feature adds its row component to ME_ROWS.
 */
const ME_ROWS: React.ComponentType[] = [
  // feature rows
  HealthRow,
  PlanRow,
  ReferralRow,
  SharedTrainerRow,
  AccountRows, // keep last: notifications, export, delete account, sign out
];

export function MeRows() {
  return (
    <>
      {ME_ROWS.map((Row, i) => (
        <Row key={i} />
      ))}
    </>
  );
}
