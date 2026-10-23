import { CheckInTemplateRow } from './media/sections';
import { AiMeRow } from './ai/AiMeRow';
import { PublishMeRows } from './PublishMeRows';
import { PlatformRows } from './platform/PlatformRows';
import { useRole } from './platform/team';

/**
 * Rows only the coach who owns the business sees (the tenant "owner" role): brand, publishing and the
 * business view. Assistant coaches in a team don't see them, so they never see money (UX finding M1, K-8).
 */
function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { isOwner } = useRole();
  return isOwner ? <>{children}</> : null;
}

const PublishForOwner = () => (
  <OwnerOnly>
    <PublishMeRows />
  </OwnerOnly>
);

/**
 * Extra rows on the coach's Me tab: check-ins, AI usage, brand and publishing, team and data.
 * Business-owner rows (billing, branding, publishing, keeping clients) go through OwnerOnly.
 */
const ME_ROWS: React.ComponentType[] = [
  CheckInTemplateRow,
  AiMeRow,
  PublishForOwner,
  PlatformRows, // keep last: your business (keeping clients, team, import/export), notifications, saved replies, sign out
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
