import { router } from 'expo-router';
import { approxMoney } from '@spotter/core';
import { ListRow } from '@spotter/ui';
import { useOwnerRetention } from './ownerRetention';

/** Owner's Me tab: MRR at risk at a glance. Wrapped in OwnerOnly by MeRows. */
export function RetentionMeRow() {
  const { status, atRisk } = useOwnerRetention();
  const n = atRisk.reduce((s, r) => s + r.count, 0);
  const subtitle =
    status !== 'ready'
      ? 'MRR at risk, trend, and what check-ins kept'
      : atRisk.length === 0
        ? 'Nothing at risk this week'
        : `${atRisk.map((r) => `${approxMoney(r.totalCents, r.currency)}`).join(' and ')} a month at risk · ${n} member${n === 1 ? '' : 's'}`;
  return <ListRow title="Retention" subtitle={subtitle} chevron last onPress={() => router.push('/retention')} />;
}
