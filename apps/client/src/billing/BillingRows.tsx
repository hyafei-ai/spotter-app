import { useState } from 'react';
import { Linking, Platform, Share } from 'react-native';
import { canLinkToPurchase, formatMoney, priceLabel, referralCode, rewardLabel } from '@spotter/core';
import { DEMO_CLIENT, DEMO_CLIENTS, defaultGrow, demoSubscriptions, growKey, type GrowState } from '@spotter/core/demo';
import { ListRow, useToast } from '@spotter/ui';
import { tenant } from '../env';
import { useApp } from '../store';

/*
 * C-10/C-11 billing rows on Me. Plans are bought on the web (Stripe), never through in-app purchase.
 * Whether the app may link to the billing page depends on store rules per platform and region
 * (canLinkToPurchase); by default iOS shows plan status only.
 * MOCK: the demo reads the trainer's Grow settings from localStorage on the web preview (shared with the
 * coach app), else the starting data, and the client's subscription from the sample history.
 */
function readGrow(): GrowState {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(growKey(tenant.slug));
    if (raw) return { ...defaultGrow(tenant.slug), ...(JSON.parse(raw) as Partial<GrowState>) };
  } catch {
    // fall back to the starting data
  }
  return defaultGrow(tenant.slug);
}

const PORTAL_REGION: string | null = null; // CLIENT INPUT REQUIRED: device storefront region once launch markets are set

export function PlanRow() {
  const toast = useToast();
  const billingProblem = useApp((s) => s.demo.billingProblem);
  const [grow] = useState(readGrow);
  // MOCK: Jordan is the first demo client; their subscription is the first sample one.
  const sub = demoSubscriptions().find((s) => s.clientId === DEMO_CLIENTS[0]!.id);
  const plan = grow.plans.find((p) => p.id === sub?.planId);
  const canLink = canLinkToPurchase(Platform.OS, PORTAL_REGION);

  if (!sub || !plan) {
    return <ListRow title="Plan" subtitle="No plan on file. Your coach sets this up." />;
  }
  const renews = plan.kind === 'monthly' ? ' · renews monthly' : plan.kind === 'weekly' ? ' · renews weekly' : '';
  const status = billingProblem ? 'Payment failed · update your card to keep coaching active' : `${priceLabel(plan)}${renews}`;

  return (
    <ListRow
      title={`Plan · ${plan.name}`}
      subtitle={canLink ? `${status}. Manage billing on the web.` : `${status}. Billing is managed outside the app.`}
      reason={billingProblem ? 'Payment problem' : undefined}
      chevron={canLink}
      onPress={
        canLink
          ? () => {
              // Live: POST /stripe/portal returns the Stripe billing portal URL for this client.
              toast({ message: `In the live app this opens Stripe’s billing page (${formatMoney(sub.priceCents, plan.currency)} plan).` });
            }
          : undefined
      }
    />
  );
}

export function ReferralRow() {
  const toast = useToast();
  const [grow] = useState(readGrow);
  // MOCK: stable demo code. Live: the my_referral_code RPC creates and returns it.
  const [code] = useState(() => referralCode(DEMO_CLIENT.name, () => 0.42));
  if (!grow.referral.enabled || !grow.page.published) return null;
  const base = grow.page.customDomain ? `https://${grow.page.customDomain}` : `https://${tenant.slug}.spotter.app`;
  const link = `${base}?ref=${code}`;
  const reward = grow.referral.reward.kind === 'none' ? null : rewardLabel(grow.referral.reward).toLowerCase();

  const share = async () => {
    const message = `I train with ${tenant.coach.name}. Have a look: ${link}`;
    try {
      await Share.share(Platform.OS === 'ios' ? { message, url: link } : { message });
    } catch {
      if (Platform.OS === 'web') await Linking.openURL(link).catch(() => toast({ message: link }));
      else toast({ message: link });
    }
  };

  return (
    <ListRow
      title="Invite a friend"
      subtitle={reward ? `Share your link. When a friend signs up, you get ${reward}.` : 'Share your link with a friend.'}
      chevron
      onPress={() => void share()}
    />
  );
}
