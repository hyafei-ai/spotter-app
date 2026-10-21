import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { buildTriage, reasonText } from '@spotter/core';
import { ListRow, SectionLabel, Tag, Text, useTheme, margin, space } from '@spotter/ui';
import { useCoach } from '../store';
import { AI_LIVE, DEMO_MONTHLY_CAP, useAi } from './store';

/** Client detail (K-3) → assistant: week summary, program draft, and the quiet-lately flag (coach-only). */
export function AiSection({ clientId }: { clientId: string }) {
  const { colors } = useTheme();
  const summary = useAi((s) => s.summaries[clientId]);
  const program = useAi((s) => s.programs[clientId]);
  const used = useAi((s) => s.used);
  const triage = useCoach((s) => s.triage);
  const churn = buildTriage(triage)
    .find((r) => r.clientId === clientId)
    ?.items.find((i) => i.reason === 'churn_risk');

  const summarySubtitle =
    summary?.status === 'draft' || summary?.status === 'sending'
      ? 'Draft ready to review · not sent'
      : summary?.status === 'sent'
        ? `Sent ${new Date(summary.sentAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
        : summary?.status === 'generating'
          ? 'Drafting…'
          : summary?.status === 'failed'
            ? 'Last draft failed · tap to try again'
            : 'Drafts a short message from this week’s logs for you to edit and approve';

  const programSubtitle =
    program?.status === 'ready'
      ? `${program.program.name} · ${program.saved ? 'saved as unpublished draft' : 'not saved yet'}`
      : 'From their intake and your exercise library. Opens as an unpublished draft.';

  return (
    <>
      <SectionLabel right={<Tag label="Draft" tone="brand" />}>Assistant</SectionLabel>
      {churn ? (
        <ListRow
          left={<Feather name="alert-triangle" size={20} color={colors.warning} />}
          title="Quiet lately"
          reason={reasonText(churn)}
          subtitle="Flagged by the nightly check. Only you see this."
        />
      ) : null}
      <ListRow
        left={<Feather name="file-text" size={20} color={colors.ink2} />}
        title="Summarise this week"
        subtitle={summarySubtitle}
        chevron
        onPress={() => router.push(`/client/${clientId}/ai-summary`)}
      />
      <ListRow
        left={<Feather name="clipboard" size={20} color={colors.ink2} />}
        title="Draft a program with AI"
        subtitle={programSubtitle}
        chevron
        last
        onPress={() => router.push(`/client/${clientId}/ai-program`)}
      />
      {!AI_LIVE ? (
        <Text variant="caption" color="ink2" style={{ paddingHorizontal: margin, paddingTop: space[2] }}>
          {used} of {DEMO_MONTHLY_CAP} AI drafts used this month. Nothing reaches a client until you approve it.
        </Text>
      ) : null}
    </>
  );
}
