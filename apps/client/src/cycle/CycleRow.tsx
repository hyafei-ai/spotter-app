import { useEffect } from 'react';
import { router } from 'expo-router';
import { CYCLE_MODE_LABEL, phaseLine } from '@spotter/core';
import { ListRow } from '@spotter/ui';
import { localDate } from '../nutrition/store';
import { useCycle } from './store';
import { useCycleToday } from './hooks';

/** Me → Your cycle. Also refreshes the coach-visible phase once a day while tracking. */
export function CycleRow() {
  const hydrated = useCycle((s) => s.hydrated);
  const publishedOn = useCycle((s) => s.publishedOn);
  const refreshToday = useCycle((s) => s.refreshToday);
  const { profile, estimate } = useCycleToday();
  const tracking = profile.mode !== 'not_tracking';

  useEffect(() => {
    if (hydrated && tracking && publishedOn !== localDate()) void refreshToday();
  }, [hydrated, tracking, publishedOn, refreshToday]);

  const subtitle = !tracking
    ? 'Off · Private'
    : [phaseLine(estimate) ?? CYCLE_MODE_LABEL[profile.mode], profile.shareWithCoach ? 'Phase shared' : 'Private'].join(' · ');
  return <ListRow title="Your cycle" subtitle={subtitle} chevron onPress={() => router.push('/cycle')} />;
}
