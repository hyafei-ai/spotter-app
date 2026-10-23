import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { KEPT_CAVEAT, approxMoney, type MrrTrend } from '@spotter/core';
import { EmptyState, IconButton, ListRow, Screen, SectionLabel, Skeleton, Text, useTheme, margin, space } from '@spotter/ui';
import { useRole } from '../src/platform/team';
import { useOwnerRetention } from '../src/atrisk/ownerRetention';

const weekLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Owner job: live MRR at risk, the last 12 weeks, and what check-ins kept. Owner only; no health data. */
export default function Retention() {
  const { isOwner } = useRole();
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} />;
  if (!isOwner) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message="Only the owner sees retention." />
      </Screen>
    );
  }
  return <OwnerRetentionScreen back={back} />;
}

function OwnerRetentionScreen({ back }: { back: React.ReactNode }) {
  const { status, live, atRisk, trend, kept, year, reload } = useOwnerRetention();
  return (
    <Screen>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Retention
        </Text>
        <Text color="ink2">Monthly revenue from members whose training or app use has dropped off, or whose coach has flagged something.</Text>
        {!live ? (
          <Text variant="caption" color="ink2">
            Sample members (MOCK). This week is worked out from them on load; earlier weeks are sample figures.
          </Text>
        ) : null}
      </View>

      {status === 'loading' ? (
        <View style={styles.body}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="80%" />
        </View>
      ) : status === 'error' ? (
        <EmptyState message="Couldn’t load retention. Check your connection." actionLabel="Try again" onAction={reload} />
      ) : (
        <>
          <SectionLabel>MRR at risk</SectionLabel>
          <View style={styles.body}>
            {atRisk.length === 0 ? (
              <Text>Nothing at risk this week.</Text>
            ) : (
              atRisk.map((r) => (
                <View key={r.currency} style={{ gap: space[1] }} accessible accessibilityLabel={`${approxMoney(r.totalCents, r.currency)} a month at risk, ${r.count} members`}>
                  <Text variant="figure" tabular>
                    {approxMoney(r.totalCents, r.currency)} a month
                  </Text>
                  <Text color="ink2">
                    {r.count} member{r.count === 1 ? '' : 's'} · high {approxMoney(r.highCents, r.currency)} ({r.highCount}) · medium {approxMoney(r.mediumCents, r.currency)} ({r.mediumCount})
                  </Text>
                </View>
              ))
            )}
          </View>

          {trend.map((t) => (
            <TrendBars key={t.currency} trend={t} />
          ))}

          <SectionLabel>{`Kept after a check-in, ${year}`}</SectionLabel>
          <View style={styles.body}>
            {kept.length === 0 ? (
              <Text color="ink2">No one kept yet this year. Members count once they’re still with you 60 days after a check-in.</Text>
            ) : (
              kept.map((k) => (
                <Text key={k.currency} variant="bodyStrong">
                  {approxMoney(k.monthlyCents, k.currency)} a month · {k.count} member{k.count === 1 ? '' : 's'}
                </Text>
              ))
            )}
            <Text variant="caption" color="ink2">
              {KEPT_CAVEAT}
            </Text>
          </View>

          <ListRow title="Members to talk to" subtitle="Who to check in with, and ask a coach to do it" chevron onPress={() => router.push('/members')} />
          <Text variant="caption" color="ink2" style={styles.foot}>
            Risk adds up points: sessions falling off (3), no session in 10 days (2), no app open in 7 days (2), a failed payment (2), missed check-ins (1),
            the first two months (1), plus anything a coach’s athletes shared that needs a check-in. You see that last part as “Their coach has flagged
            something worth a check-in”: health details stay between the athlete and their coach. 5+ points is high, 3–4 medium.
          </Text>
        </>
      )}
    </Screen>
  );
}

/** Weekly bars with a text alternative: the change over the period and the latest week. */
function TrendBars({ trend }: { trend: MrrTrend }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...trend.points.map((p) => p.totalCents ?? 0));
  const known = trend.points.filter((p) => p.totalCents != null);
  const last = trend.points[trend.points.length - 1]!;
  const change =
    trend.changeCents == null
      ? 'Not enough weeks yet to show a change.'
      : trend.changeCents === 0
        ? 'Level with 12 weeks ago.'
        : `${trend.changeCents > 0 ? 'Up' : 'Down'} ${approxMoney(Math.abs(trend.changeCents), trend.currency)} since the week of ${weekLabel(known[0]!.weekStart)}.`;
  return (
    <>
      <SectionLabel>{`Last 12 weeks (${trend.currency.toUpperCase()})`}</SectionLabel>
      <View style={styles.body}>
        <View
          style={styles.bars}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`MRR at risk by week. This week ${approxMoney(last.totalCents ?? 0, trend.currency)}. ${change}`}
        >
          {trend.points.map((p) => (
            <View key={p.weekStart} style={styles.barSlot}>
              <View
                style={{
                  height: p.totalCents == null ? 2 : Math.max(2, Math.round((p.totalCents / max) * 80)),
                  backgroundColor: p.totalCents == null ? colors.line : p === last ? colors.brand : colors.ink2,
                  borderRadius: 2,
                }}
              />
            </View>
          ))}
        </View>
        <View style={styles.axis}>
          <Text variant="caption" color="ink2">
            {weekLabel(trend.points[0]!.weekStart)}
          </Text>
          <Text variant="caption" color="ink2">
            This week
          </Text>
        </View>
        <Text variant="callout" color="ink2">
          {change}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, gap: space[2], paddingVertical: space[3] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 84, gap: 4 },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  foot: { paddingHorizontal: margin, paddingTop: space[3], paddingBottom: space[6] },
});
