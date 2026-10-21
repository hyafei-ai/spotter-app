import { PlanRow, ReferralRow } from './billing/BillingRows';

/**
 * Extra rows on the client's Me tab (C-10): health app, billing, export, delete, etc.
 * Each feature adds its row component to ME_ROWS.
 */
const ME_ROWS: React.ComponentType[] = [
  // feature rows
  PlanRow,
  ReferralRow,
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
