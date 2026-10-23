import { router } from 'expo-router';
import { approxMoney } from '@spotter/core';
import { ListRow } from '@spotter/ui';
import { useOwnerRetention } from './ownerRetention';

/** Me → Your business: monthly income at risk at a glance. Owner role only (rendered inside PlatformRows' owner section). */
export function RetentionMeRow() {
  const { status, atRisk } = useOwnerRetention();
  const n = atRisk.reduce((s, r) => s + r.count, 0);
  const subtitle =
    status !== 'ready'
      ? 'Income at risk, the trend, and who stayed after a check-in'
      : atRisk.length === 0
        ? 'Nothing at risk this week'
        : `${atRisk.map((r) => `${approxMoney(r.totalCents, r.currency)}`).join(' and ')} a month at risk · ${n} client${n === 1 ? '' : 's'}`;
  return <ListRow title="Keeping clients" subtitle={subtitle} chevron onPress={() => router.push('/retention')} />;
}
