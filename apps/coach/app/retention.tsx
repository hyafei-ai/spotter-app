import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  INTERVENTION_DONE_LABEL,
  KEPT_AFTER_DAYS,
  KEPT_CAVEAT,
  OWNER_NEUTRAL_REASON,
  SPOTTER_PRICE_MONTHLY_CENTS,
  approxMoney,
  yearlyValueCents,
  type KeptRow,
  type MrrTrend,
} from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, Skeleton, Tag, Text, useTheme, margin, space } from '@spotter/ui';
import { useRole } from '../src/platform/team';
import { useOwnerRetention } from '../src/atrisk/ownerRetention';
import { useViewerLens } from '../src/atrisk/AtRiskList';
import { useRetention, useRetentionViews } from '../src/retention/store';

const DAY = 86_400_000;
const weekLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Me → Your business → Keeping clients. The coach's business job (docs/jtbd.md): income at risk this
 * month, the last 12 weeks, and who stayed after a check-in. Owner role only, so assistant coaches in
 * a team never see money. Who to check in with is one list, Clients → Check in.
 */
export default function Retention() {
  const { isOwner } = useRole();
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} />;
  if (!isOwner) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message="Only the head coach sees the business numbers." actionLabel="See who needs a check-in" onAction={() => router.replace('/clients?filter=attention')} />
      </Screen>
    );
  }
  return <BusinessScreen back={back} />;
}

function BusinessScreen({ back }: { back: React.ReactNode }) {
  const { status, live, atRisk, trend, kept, year, reload } = useOwnerRetention();
  const { solo } = useViewerLens();
  const { kept: keptList } = useRetentionViews();
  const currency = useRetention((s) => s.currency);
  const n = atRisk.reduce((s, r) => s + r.count, 0);
  return (
    <Screen>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Keeping clients
        </Text>
        <Text color="ink2">Monthly income from clients whose training, app use or what they shared with you says a check-in would help.</Text>
        {!live ? (
          <Text variant="caption" color="ink2">
            Sample clients (MOCK). This week is worked out from them on load; earlier weeks are sample figures.
          </Text>
        ) : null}
      </View>

      {status === 'loading' ? (
        <View style={styles.body} accessibilityLabel="Loading" accessibilityRole="progressbar">
          <Skeleton width="60%" height={28} />
          <Skeleton width="80%" />
        </View>
      ) : status === 'error' ? (
        <EmptyState message="Couldn’t load your numbers. Check your connection." actionLabel="Try again" onAction={reload} />
      ) : (
        <>
          <SectionLabel>At risk this month</SectionLabel>
          <View style={styles.body}>
            {atRisk.length === 0 ? (
              <Text>Nothing at risk this week. Everyone’s training and checking in as usual.</Text>
            ) : (
              atRisk.map((r) => (
                <View
                  key={r.currency}
                  style={{ gap: space[1] }}
                  accessible
                  accessibilityLabel={`${approxMoney(r.totalCents, r.currency)} a month at risk, ${r.count} client${r.count === 1 ? '' : 's'}`}
                >
                  <Text variant="figure" tabular>
                    {approxMoney(r.totalCents, r.currency)} a month
                  </Text>
                  <Text color="ink2">
                    {r.count} client{r.count === 1 ? '' : 's'} · needs a check-in soon {approxMoney(r.highCents, r.currency)} ({r.highCount}) · worth watching{' '}
                    {approxMoney(r.mediumCents, r.currency)} ({r.mediumCount})
                  </Text>
                </View>
              ))
            )}
            <Button
              label={n ? `See who needs a check-in (${n})` : 'See who needs a check-in'}
              icon="users"
              onPress={() => router.push('/clients?filter=attention')}
            />
          </View>

          {trend.map((t) => (
            <TrendBars key={t.currency} trend={t} />
          ))}

          <SectionLabel>{`Kept after a check-in, ${year}`}</SectionLabel>
          <View style={styles.body}>
            {kept.length === 0 ? (
              <Text color="ink2">No one kept yet this year. Clients count once they’re still with you 60 days after a check-in.</Text>
            ) : (
              kept.map((k) => (
                <Text key={k.currency} variant="headline">
                  {approxMoney(k.monthlyCents, k.currency)} a month · {k.count} client{k.count === 1 ? '' : 's'}
                  {k.monthlyCents ? <Text color="ink2">{` (${approxMoney(yearlyValueCents(k.monthlyCents), k.currency)} a year)`}</Text> : null}
                </Text>
              ))
            )}
            <Text variant="caption" color="ink2">
              {KEPT_CAVEAT}
            </Text>
            {SPOTTER_PRICE_MONTHLY_CENTS != null && kept.length ? (
              <Text variant="callout" color="ink2">{`Spotter costs ${approxMoney(yearlyValueCents(SPOTTER_PRICE_MONTHLY_CENTS), currency)} a year.`}</Text>
            ) : null}
          </View>
          <KeptList kept={keptList} />

          <SectionLabel>How it’s worked out</SectionLabel>
          <Text variant="caption" color="ink2" style={styles.foot}>
            Each signal adds points: sessions falling off (3), no session in 10 days (2), no app open in 7 days (2), a failed payment (2), missed weekly
            check-ins (1), the first two months (1), plus what a client shared with you: running tired (2), the fuel check (1–2), ongoing pain (2) or no new
            best in 8 weeks (1). 5+ points is “Needs a check-in soon”, 3–4 “Worth watching”. Clients show up after two weeks with you; paused and
            cancelled clients don’t count.
            {solo
              ? ''
              : ` For clients an assistant coaches, what they shared stays with that coach; you see “${OWNER_NEUTRAL_REASON}”.`}
          </Text>
        </>
      )}
    </Screen>
  );
}

/** Each check-in this year and how it turned out. Moved here from the old Members to talk to screen. */
function KeptList({ kept }: { kept: ReturnType<typeof useRetentionViews>['kept'] }) {
  const { viewerId } = useViewerLens();
  const rows = [...kept.kept, ...kept.pending, ...kept.waiting, ...kept.left];
  if (!rows.length) {
    return (
      <Text color="ink2" style={styles.foot}>
        When you check in with someone on Check in, you’ll see here whether they stayed.
      </Text>
    );
  }
  const how = (r: KeptRow) => (r.action ? INTERVENTION_DONE_LABEL[r.action] : 'checked in');
  const who = (r: KeptRow) => (r.coachId === viewerId ? 'You' : r.coachName.split(' ')[0]);
  const line = (r: KeptRow) => {
    const by = `${who(r)} ${how(r)} on ${shortDate(r.doneOn ?? r.requestedOn)}`;
    switch (r.outcome) {
      case 'kept':
        return `${by} · still with you`;
      case 'left':
        return `${by} · left`;
      case 'pending': {
        const at = new Date(Date.parse(`${r.doneOn}T12:00:00Z`) + KEPT_AFTER_DAYS * DAY).toISOString();
        return `${by} · you’ll know on ${shortDate(at)}`;
      }
      default:
        return `Asked ${r.coachName.split(' ')[0]} on ${shortDate(r.requestedOn)} · not checked in yet`;
    }
  };
  return (
    <>
      {rows.map((r, i) => (
        <ListRow
          key={r.id}
          title={r.clientName}
          subtitle={line(r)}
          right={
            r.outcome === 'kept' ? (
              <Tag label="Kept" tone="success" />
            ) : r.outcome === 'left' ? (
              <Tag label="Left" />
            ) : r.outcome === 'pending' ? (
              <Tag label="Pending" tone="warning" />
            ) : (
              <Tag label="Asked" tone="brand" />
            )
          }
          last={i === rows.length - 1}
        />
      ))}
    </>
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
          accessibilityLabel={`Income at risk by week. This week ${approxMoney(last.totalCents ?? 0, trend.currency)}. ${change}`}
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
