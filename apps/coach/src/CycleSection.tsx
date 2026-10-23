import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CYCLE_PHASE_LABEL } from '@spotter/core';
import { cycleKey, type SharedCycle, type SharedCycleDoc } from '@spotter/core/demo';
import { SectionLabel, Skeleton, Text, onSharedChange, readShared, margin, space } from '@spotter/ui';
import { useCoach } from './store';
import { tenant } from './env';

/*
 * K-3 client detail → Cycle. Read-only, and only what the client chose to share: today's estimated phase
 * and the calibration summary. Real builds call cycle_shared_for_coach(client), which returns nothing
 * unless sharing is on. MOCK: the demo client app writes the same projection to `spotter.cycle.<tenant>`.
 */
export function useSharedCycle(clientId: string): { loaded: boolean; cycle: SharedCycle | null } {
  const [state, setState] = useState<{ loaded: boolean; cycle: SharedCycle | null }>({ loaded: false, cycle: null });
  useEffect(() => {
    let live = true;
    const load = () =>
      void readShared<SharedCycleDoc>(cycleKey(tenant.slug), {}).then((doc) => {
        const c = doc[clientId];
        if (live) setState({ loaded: true, cycle: c?.shared ? c : null });
      });
    load();
    const off = onSharedChange((key) => key === cycleKey(tenant.slug) && load());
    return () => {
      live = false;
      off();
    };
  }, [clientId]);
  return state;
}

export function CycleSection({ clientId }: { clientId: string }) {
  const client = useCoach((s) => s.clients.find((c) => c.id === clientId));
  const { loaded, cycle } = useSharedCycle(clientId);
  const first = client?.name.split(' ')[0] ?? 'This client';

  return (
    <>
      <SectionLabel>Cycle</SectionLabel>
      <View style={styles.body}>
        {!loaded ? (
          <Skeleton height={48} />
        ) : !cycle ? (
          <Text variant="callout" color="ink2">
            {first} keeps cycle data private.
          </Text>
        ) : (
          <View style={{ gap: space[1] }}>
            <Text variant="callout">
              {cycle.phase ? `${cycle.phase === 'menstrual' ? 'Period' : `${CYCLE_PHASE_LABEL[cycle.phase]} phase`} today (estimated)` : 'No phase estimate today'}
            </Text>
            {cycle.calibration ? (
              <>
                <Text variant="callout" color="ink2">
                  {cycle.calibration.summary}
                </Text>
                <Text variant="callout">
                  {cycle.calibration.appliedPctToday
                    ? `Applies ${Math.abs(cycle.calibration.appliedPctToday)}% ${cycle.calibration.appliedPctToday < 0 ? 'lighter' : 'heavier'} to suggested loads today. ${first} can switch back to the planned loads.`
                    : 'No change to suggested loads today.'}
                </Text>
              </>
            ) : null}
            <Text variant="caption" color="ink2">
              Shared by {first}. Period dates and symptoms stay private. An estimate, not a diagnosis.
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingVertical: space[3], gap: space[3] },
});
