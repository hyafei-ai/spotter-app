import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import {
  LEAD_STATUS_LABEL,
  businessStats,
  formatMoney,
  rewardLabel,
  type Lead,
  type LeadStatus,
  type ReferralReward,
} from '@spotter/core';
import { demoSubscriptions } from '@spotter/core/demo';
import {
  Banner,
  Button,
  EmptyState,
  ListRow,
  Screen,
  ScreenHeader,
  SectionLabel,
  Sheet,
  Tag,
  Text,
  useTheme,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { tenant } from '../../src/env';
import { WEB_URL, pageUrl, useGrowStore } from '../../src/grow';

const STATUS_TONE: Record<LeadStatus, 'brand' | 'neutral' | 'success' | 'warning'> = {
  new: 'brand',
  contacted: 'neutral',
  trial: 'warning',
  won: 'success',
  lost: 'neutral',
};

const REWARDS: { value: string; label: string; reward: ReferralReward }[] = [
  { value: 'w1', label: '1 week free', reward: { kind: 'free_weeks', value: 1 } },
  { value: 'w2', label: '2 weeks free', reward: { kind: 'free_weeks', value: 2 } },
  { value: 'p25', label: '25% off', reward: { kind: 'percent_off_month', value: 25 } },
];

/** K-6 Grow: share the page, work leads, run referrals, and see business numbers from real data. */
export default function Grow() {
  const { colors } = useTheme();
  const toast = useToast();
  const { grow, update, reload } = useGrowStore();
  const [lead, setLead] = useState<Lead | null>(null);
  const [referralSheet, setReferralSheet] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)), []);
  // The web dashboard may have changed the page or leads (same browser on the web preview).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  // MOCK: sample subscription history for the demo business. Live: the subscriptions table.
  const subs = useMemo(() => (tenant.slug === 'maya-reyes-strength' ? demoSubscriptions() : []), []);
  const stats = businessStats(subs);
  const currency = grow.plans[0]?.currency ?? 'usd';
  const url = pageUrl(grow);
  const newLeads = grow.leads.filter((l) => l.status === 'new').length;

  const share = async () => {
    try {
      await Share.share(Platform.OS === 'ios' ? { url, message: `Coaching with ${tenant.coach.name}` } : { message: `Coaching with ${tenant.coach.name}: ${url}` });
    } catch {
      toast({ message: 'Couldn’t open the share sheet. The link is ' + url });
    }
  };

  const openDashboard = () => {
    if (WEB_URL) void Linking.openURL(`${WEB_URL}/dashboard/grow`);
    else toast({ message: 'Open the coach dashboard on a computer to build your page.' });
  };

  const setStatus = (l: Lead, status: LeadStatus) => {
    update((g) => ({ ...g, leads: g.leads.map((x) => (x.id === l.id ? { ...x, status } : x)) }));
    setLead(null);
    toast({ message: `${l.name.split(' ')[0]} marked ${LEAD_STATUS_LABEL[status].toLowerCase()}` });
  };

  const pct = (n: number | null) => (n == null ? null : `${Math.round(n * 100)}%`);
  const currentReward = REWARDS.find((r) => r.reward.kind === grow.referral.reward.kind && r.reward.value === grow.referral.reward.value)?.value ?? null;

  return (
    <Screen banner={!online ? <Banner message="You’re offline. Changes save on this phone." /> : undefined}>
      <ScreenHeader title="Grow" subtitle={newLeads ? `${newLeads} new lead${newLeads === 1 ? '' : 's'}` : undefined} />

      <SectionLabel>Your page</SectionLabel>
      {grow.page.published ? (
        <View style={styles.body}>
          <Text variant="bodyStrong" selectable>
            {url.replace('https://', '')}
          </Text>
          <Text variant="callout" color="ink2">
            Plans, a contact form and your own words. Edit it on the web dashboard.
          </Text>
          <View style={styles.buttons}>
            <Button label="Share my page" icon="share" onPress={() => void share()} />
            <Button label="Edit on the web" kind="quiet" onPress={openDashboard} />
          </View>
        </View>
      ) : (
        <EmptyState message="No landing page yet. Build one on the web dashboard, then share it from here." actionLabel="Open the web dashboard" onAction={openDashboard} />
      )}

      <SectionLabel>Payments</SectionLabel>
      {grow.stripe.connected ? (
        <ListRow
          left={<Feather name="check-circle" size={20} color={colors.success} />}
          title="Stripe connected"
          subtitle={grow.stripe.chargesEnabled ? 'Clients pay you directly.' : 'Stripe still needs a few details before you can take payments.'}
        />
      ) : (
        <View style={styles.body}>
          <Text>Payments not connected. Clients can’t buy plans until you connect Stripe.</Text>
          <Button
            label="Connect Stripe"
            onPress={() => {
              // MOCK: live builds call the stripe-connect-onboard function and open Stripe's onboarding in the browser.
              update((g) => ({ ...g, stripe: { connected: true, chargesEnabled: true } }));
              toast({ message: 'Connected a test Stripe account (demo).' });
            }}
          />
        </View>
      )}

      <SectionLabel>Business</SectionLabel>
      {subs.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          No paying clients yet. Numbers appear once clients sign up.
        </Text>
      ) : (
        <View style={styles.stats}>
          <Stat label="Active clients" value={String(stats.activeClients)} />
          <Stat label="MRR" value={formatMoney(Math.round(stats.mrrCents / 100) * 100, currency)} />
          <Stat label="Churn this month" value={pct(stats.churnThisMonth.rate)} />
          <Stat label="Avg. client lifetime" value={stats.averageLifetimeDays == null ? null : `${stats.averageLifetimeDays} days`} />
          <Stat label="Trial to paid" value={pct(stats.trialToPaid.rate)} />
        </View>
      )}

      <SectionLabel>Leads</SectionLabel>
      {grow.leads.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          No leads yet. They arrive here when someone sends the form on your page.
        </Text>
      ) : (
        grow.leads.map((l, i) => (
          <ListRow
            key={l.id}
            title={l.name}
            subtitle={`${l.message ? `“${l.message}” · ` : ''}${new Date(l.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${l.source === 'referral' ? ' · referral' : ''}`}
            right={<Tag label={LEAD_STATUS_LABEL[l.status]} tone={STATUS_TONE[l.status]} />}
            onPress={() => setLead(l)}
            accessibilityHint="Change status or email them"
            last={i === grow.leads.length - 1}
          />
        ))
      )}

      <SectionLabel>Referrals</SectionLabel>
      <ListRow
        title="Referral programme"
        subtitle={grow.referral.enabled ? `On · ${rewardLabel(grow.referral.reward)} for each friend who signs up` : 'Off'}
        chevron
        last
        onPress={() => setReferralSheet(true)}
      />

      <Sheet visible={!!lead} title={lead?.name ?? ''} onClose={() => setLead(null)}>
        {lead ? (
          <>
            <Text variant="callout" color="ink2" style={styles.sheetText}>
              {lead.email}
            </Text>
            <ListRow
              title={`Email ${lead.name.split(' ')[0]}`}
              left={<Feather name="mail" size={20} color={colors.ink2} />}
              onPress={() => void Linking.openURL(`mailto:${lead.email}?subject=${encodeURIComponent(`Coaching with ${tenant.coach.name}`)}`)}
            />
            {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s, i, all) => (
              <ListRow
                key={s}
                title={`Mark ${LEAD_STATUS_LABEL[s].toLowerCase()}`}
                right={lead.status === s ? <Feather name="check" size={20} color={colors.brand} /> : undefined}
                last={i === all.length - 1}
                onPress={() => setStatus(lead, s)}
              />
            ))}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={referralSheet} title="Referral programme" onClose={() => setReferralSheet(false)}>
        <View style={[styles.toggle, { borderBottomColor: colors.line }]}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Give clients a referral link</Text>
            <Text variant="callout" color="ink2">
              They can share it from their app.
            </Text>
          </View>
          <Switch
            value={grow.referral.enabled}
            onValueChange={(enabled) => update((g) => ({ ...g, referral: { ...g.referral, enabled } }))}
            accessibilityLabel="Give clients a referral link"
            trackColor={{ true: colors.brand, false: colors.line }}
            thumbColor={colors.surface}
            {...{ activeThumbColor: colors.surface }}
          />
        </View>
        <Text variant="label" color="ink2" style={styles.sheetText}>
          Reward for each friend who signs up
        </Text>
        {REWARDS.map((r, i) => (
          <Pressable
            key={r.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: currentReward === r.value, disabled: !grow.referral.enabled }}
            disabled={!grow.referral.enabled}
            onPress={() => update((g) => ({ ...g, referral: { ...g.referral, reward: r.reward } }))}
            style={[styles.choice, { borderBottomColor: colors.line, opacity: grow.referral.enabled ? 1 : 0.5 }, i === REWARDS.length - 1 && { borderBottomWidth: 0 }]}
          >
            <Text style={{ flex: 1 }}>{r.label}</Text>
            {currentReward === r.value ? <Feather name="check" size={20} color={colors.brand} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.stat}>
      <Text variant="label" color="ink2">
        {label}
      </Text>
      {value == null ? (
        <Text variant="callout" color="ink2">
          Not enough data yet
        </Text>
      ) : (
        <Text variant="figure" tabular>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[2] },
  buttons: { gap: space[1], marginTop: space[2] },
  stats: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: margin, paddingTop: space[3], rowGap: space[4], columnGap: space[6] },
  stat: { minWidth: 130, gap: 2 },
  sheetText: { paddingHorizontal: margin, paddingTop: space[2], paddingBottom: space[1] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  choice: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: margin, borderBottomWidth: StyleSheet.hairlineWidth },
});
