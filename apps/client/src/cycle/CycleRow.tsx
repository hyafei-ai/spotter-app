import { useEffect } from 'react';
import { router } from 'expo-router';
import { CYCLE_MODE_LABEL, phaseLine } from '@spotter/core';
import { ListRow } from '@spotter/ui';
import { localDate } from '../nutrition/store';
import { useCycle } from './store';
import { useCycleToday } from './hooks';

/** Refreshes the coach-visible phase once a day while tracking (the server copy goes stale). Used on Today. */
export function useCycleDailyRefresh() {
  const hydrated = useCycle((s) => s.hydrated);
  const publishedOn = useCycle((s) => s.publishedOn);
  const refreshToday = useCycle((s) => s.refreshToday);
  const mode = useCycle((s) => s.mode);
  const tracking = mode !== 'not_tracking';
  useEffect(() => {
    if (hydrated && tracking && publishedOn !== localDate()) void refreshToday();
  }, [hydrated, tracking, publishedOn, refreshToday]);
}

/** A row to Your cycle (Body tab's "Track your cycle" uses its own row). */
export function CycleRow() {
  useCycleDailyRefresh();
  const { profile, estimate } = useCycleToday();
  const tracking = profile.mode !== 'not_tracking';

  const subtitle = !tracking
    ? 'Off · Private'
    : [phaseLine(estimate) ?? CYCLE_MODE_LABEL[profile.mode], profile.shareWithCoach ? 'Phase shared' : 'Private'].join(' · ');
  return <ListRow title="Your cycle" subtitle={subtitle} chevron onPress={() => router.push('/cycle')} />;
}
