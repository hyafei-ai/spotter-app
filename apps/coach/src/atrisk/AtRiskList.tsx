import { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { COACH_LEVEL_TEXT, atRiskRoster, type AtRiskMember } from '@spotter/core';
import { Button, EmptyState, ListRow, Monogram, Skeleton, Text, margin, space } from '@spotter/ui';
import { initials } from '../store';
import { localToday, useEngagement, usePhysiologyMap } from './inputs';

/**
 * Clients → "Needs attention": who could use a check-in, most first, with the top two reasons from
 * sessions, app use and what each athlete shared. Coach language only (docs/jtbd.md): no churn, no
 * risk, no scores.
 */
export function useNeedsAttention(visibleIds: string[]): { status: 'loading' | 'ready' | 'error'; roster: AtRiskMember[]; retry: () => void } {
  const { status, activity, load } = useEngagement();
  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);
  const { ready, physio } = usePhysiologyMap(visibleIds);
  const today = localToday();
  const roster = useMemo(() => {
    const visible = new Set(visibleIds);
    return atRiskRoster(
      activity.filter((a) => visible.has(a.clientId)),
      physio,
      today,
    );
  }, [activity, physio, visibleIds, today]);
  return {
    status: status === 'error' ? 'error' : status === 'ready' && ready ? 'ready' : 'loading',
    roster,
    retry: () => void load(),
  };
}

export function AtRiskList({ visibleIds, query }: { visibleIds: string[]; query: string }) {
  const { status, roster, retry } = useNeedsAttention(visibleIds);
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
        Who could use a check-in first, from sessions, app use and what each athlete shares with you.
      </Text>
      {rows.map((m, i) => (
        <ListRow
          key={m.clientId}
          left={<Monogram initials={initials(m.name)} size={40} />}
          title={m.name}
          reason={COACH_LEVEL_TEXT[m.risk.level]}
          subtitle={m.risk.reasons.slice(0, 2).join(' · ')}
          chevron
          last={i === rows.length - 1}
          onPress={() => router.push(`/client/${m.clientId}`)}
        />
      ))}
    </ScrollView>
  );
}
