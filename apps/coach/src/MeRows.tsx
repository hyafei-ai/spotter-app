import { PlatformRows } from './platform/PlatformRows';

/**
 * Extra rows on the coach's Me tab: brand, publish, team, data. Each feature adds its row to ME_ROWS.
 * Owner-only rows (billing, branding, publishing) should check useRole().isOwner from ./platform/team.
 */
const ME_ROWS: React.ComponentType[] = [
  // feature rows
  PlatformRows, // keep last: team, import/export, notifications, saved replies, sign out
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
