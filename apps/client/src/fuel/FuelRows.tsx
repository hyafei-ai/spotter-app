import { useEffect } from 'react';
import { router } from 'expo-router';
import { EA_BAND_LABEL, FUEL_LEVEL_LABEL, type FuelCheck } from '@spotter/core';
import { ListRow } from '@spotter/ui';
import { useDueVisible } from '../DueItems';
import { isOn } from '../modules';
import { useFuel } from './store';
import { useFuelCheck } from './useFuelCheck';

export function fuelSubtitle(c: FuelCheck): string {
  if (c.eaBand === 'unknown') return c.level === 'none' ? (c.note ?? EA_BAND_LABEL.unknown) : FUEL_LEVEL_LABEL[c.level];
  return `${FUEL_LEVEL_LABEL[c.level]} · energy availability ${EA_BAND_LABEL[c.eaBand].split(' (')[0]!.toLowerCase()}`;
}

/** Shares today's level with the coach when the athlete turned sharing on (and it changed). */
export function useSharePublisher(c: FuelCheck, today: string) {
  const share = useFuel((s) => s.settings.shareWithCoach);
  const hydrated = useFuel((s) => s.hydrated);
  const publish = useFuel((s) => s.publish);
  const signs = c.signs.map((s) => s.text).join('|');
  useEffect(() => {
    if (!hydrated || !share) return;
    void publish({ date: today, level: c.level, signs: signs ? signs.split('|') : [] });
  }, [hydrated, share, publish, today, c.level, signs]);
}

/** Me → Fuel check. Only when the trainer has nutrition switched on. */
export function FuelMeRow() {
  if (!isOn('nutrition')) return null;
  return <FuelMeRowInner />;
}
function FuelMeRowInner() {
  const { check } = useFuelCheck();
  return <ListRow title="Fuel check" subtitle={fuelSubtitle(check)} chevron onPress={() => router.push('/nutrition/fuel')} />;
}

/** Nutrition home → Fuel check. */
export function FuelNutritionRow() {
  const { check } = useFuelCheck();
  return (
    <ListRow
      title="Fuel check"
      subtitle={fuelSubtitle(check)}
      chevron
      onPress={() => router.push('/nutrition/fuel')}
      accessibilityHint="Is food keeping up with training? A screen, not a diagnosis"
    />
  );
}

/** Today → Due: only when the fuel check says it's worth talking to someone. Also keeps the shared level current. */
export function FuelDueRow() {
  const { check, today } = useFuelCheck();
  useSharePublisher(check, today);
  const show = check.level === 'talk_to_someone';
  useDueVisible(show);
  if (!show) return null;
  return (
    <ListRow
      title="Fuel check: worth a look"
      subtitle={check.signs[0]?.text ?? FUEL_LEVEL_LABEL.talk_to_someone}
      chevron
      onPress={() => router.push('/nutrition/fuel')}
      accessibilityHint="Opens the fuel check"
    />
  );
}
