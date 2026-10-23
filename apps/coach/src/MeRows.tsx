import { CheckInTemplateRow } from './media/sections';
import { AiMeRow } from './ai/AiMeRow';
import { PublishMeRows } from './PublishMeRows';
import { PlatformRows } from './platform/PlatformRows';
import { useRole } from './platform/team';
import { MembersMeRow } from './retention/MembersMeRow';
import { RetentionMeRow } from './atrisk/RetentionMeRow';

/** Brand and publishing are owner-only; assistants don't see them (UX finding M1, K-8). */
function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { isOwner } = useRole();
  return isOwner ? <>{children}</> : null;
}

const PublishForOwner = () => (
  <OwnerOnly>
    <PublishMeRows />
  </OwnerOnly>
);

const MembersForOwner = () => (
  <OwnerOnly>
    <MembersMeRow />
  </OwnerOnly>
);

const RetentionForOwner = () => (
  <OwnerOnly>
    <RetentionMeRow />
  </OwnerOnly>
);

/**
 * Extra rows on the coach's Me tab: check-ins, AI usage, brand and publishing, team and data.
 * Owner-only rows (billing, branding, publishing) go through OwnerOnly.
 */
const ME_ROWS: React.ComponentType[] = [
  CheckInTemplateRow,
  AiMeRow,
  PublishForOwner,
  MembersForOwner,
  RetentionForOwner,
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
