import { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { COACH_LEVEL_TEXT, atRiskRoster, monthlyRevenueCents, monthlyValueText, reasonsFor, type AtRiskMember } from '@spotter/core';
import { Button, EmptyState, ListRow, Monogram, Skeleton, Text, margin, space } from '@spotter/ui';
import { initials } from '../store';
import { useRole, useTeam } from '../platform/team';
import { useRetention } from '../retention/store';
import { localToday, useEngagement, usePhysiologyMap } from './inputs';

/**
 * Clients → "Needs attention": the one "who to check in with" list. Most first, with the top two
 * reasons from sessions, app use and what each client shared with their coach. Coach language only
 * (docs/jtbd.md): no churn, no risk, no scores. Logging the check-in happens on client detail.
 */

/**
 * Who is looking, for reasonsFor: the viewer, and whether the business has other active coaches.
 * Solo (the default) means every reason is shown and no hand-off UI appears.
 */
export function useViewerLens() {
  const { viewerId, isOwner, viewer } = useRole();
  const coaches = useTeam((s) => s.coaches);
  const coachOf = useTeam((s) => s.coachOf);
  const active = useMemo(() => coaches.filter((c) => c.status === 'active'), [coaches]);
  return { viewerId, isOwner, viewer, coaches: active, coachOf, solo: active.length <= 1 };
}

export function useNeedsAttention(visibleIds: string[]): { status: 'loading' | 'ready' | 'error'; roster: AtRiskMember[]; retry: () => void } {
  const { status, activity, load } = useEngagement();
  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);
  const { ready, physio } = usePhysiologyMap(visibleIds);
  const { viewerId, coachOf, solo } = useViewerLens();
  const today = localToday();
  const roster = useMemo(() => {
    const visible = new Set(visibleIds);
    return atRiskRoster(
      activity.filter((a) => visible.has(a.clientId)).map((a) => ({ ...a, coachId: a.coachId ?? coachOf[a.clientId] ?? null })),
      physio,
      today,
    ).map((m) => ({ ...m, risk: reasonsFor(viewerId, m, m.risk, { solo }) }));
  }, [activity, physio, visibleIds, today, viewerId, coachOf, solo]);
  return {
    status: status === 'error' ? 'error' : status === 'ready' && ready ? 'ready' : 'loading',
    roster,
    retry: () => void load(),
  };
}

/**
 * Plan value per client, for the coach who owns the business only (assistants never see money).
 * Comes from the owner-role retention inputs, not from the coach engagement feed, which has no prices.
 */
export function usePlanValues(): { valueOf: (clientId: string) => string | null; monthlyOf: (clientId: string) => number } {
  const { isOwner } = useRole();
  const status = useRetention((s) => s.status);
  const activity = useRetention((s) => s.activity);
  const currency = useRetention((s) => s.currency);
  useEffect(() => {
    if (isOwner && status === 'idle') void useRetention.getState().load();
  }, [isOwner, status]);
  const monthly = useMemo(
    () => new Map(activity.map((a) => [a.clientId, a.subscription ? monthlyRevenueCents(a.subscription) : 0])),
    [activity],
  );
  return {
    monthlyOf: (id) => monthly.get(id) ?? 0,
    valueOf: (id) => {
      const cents = monthly.get(id) ?? 0;
      return isOwner && cents > 0 ? monthlyValueText(cents, currency) : null;
    },
  };
}

export function AtRiskList({ visibleIds, query }: { visibleIds: string[]; query: string }) {
  const { status, roster, retry } = useNeedsAttention(visibleIds);
  const { valueOf } = usePlanValues();
  const q = query.trim().toLowerCase();
  const rows = roster.filter((m) => !q || m.name.toLowerCase().includes(q));

  if (status === 'loading') {
    return (
      <View style={{ paddingHorizontal: margin, gap: space[3], paddingTop: space[3] }}>
        <Skeleton height={40} />
        <Skeleton height={40} />
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={{ paddingHorizontal: margin, gap: space[2], paddingTop: space[3], alignItems: 'flex-start' }}>
        <Text color="ink2">Couldn’t load who needs attention. Check your connection.</Text>
        <Button label="Try again" kind="quiet" icon="refresh-cw" full={false} onPress={retry} />
      </View>
    );
  }
  if (rows.length === 0) {
    return <EmptyState message={q ? 'No clients match.' : 'Nobody needs a check-in right now. Everyone’s training and sharing as usual.'} />;
  }
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space[6] }}>
      <Text variant="caption" color="ink2" style={{ paddingHorizontal: margin, paddingBottom: space[2] }}>
        Who could use a check-in first, from sessions, app use and what each client shares with you. Open someone to log your check-in.
      </Text>
      {rows.map((m, i) => {
        const value = valueOf(m.clientId);
        return (
          <ListRow
            key={m.clientId}
            left={<Monogram initials={initials(m.name)} size={40} />}
            title={m.name}
            reason={COACH_LEVEL_TEXT[m.risk.level]}
            subtitle={m.risk.reasons.slice(0, 2).join(' · ')}
            right={
              value ? (
                <Text variant="caption" color="ink2" accessibilityLabel={`Plan ${value.replace('/mo', ' a month')}`}>
                  {value}
                </Text>
              ) : undefined
            }
            chevron
            last={i === rows.length - 1}
            onPress={() => router.push(`/client/${m.clientId}`)}
          />
        );
      })}
    </ScrollView>
  );
}
