import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { IMPORTED_ACTIVITY_LABEL, formatNumber, type ImportedActivity } from '@spotter/core';
import { Button, ListRow, Sheet, Text, margin, space } from '@spotter/ui';
import { kv } from '../storage';
import { tenant } from '../env';
import { health } from './source';
import type { HealthToday } from './types';
import { useHealthImports } from './store';
import { PainToggle } from '../injury/PainCheck';

type Status = 'not_connected' | 'connected' | 'denied';

export const useHealthStatus = create<{ status: Status; set: (s: Status) => void }>()(
  persist((set) => ({ status: 'not_connected', set: (status) => set({ status }) }), {
    name: 'spotter.health',
    storage: createJSONStorage(() => kv),
    partialize: ({ status }) => ({ status }),
  }),
);

/**
 * Me → connected health app (C-10). Read-only: steps, bodyweight and sleep, and for the daily brief HRV,
 * resting heart rate, active energy, food totals other apps wrote and workouts recorded elsewhere, with a
 * per-type on/off for imported workouts. Apple Watch data comes through Apple Health.
 */
export function HealthRow() {
  const { status, set } = useHealthStatus();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [today, setToday] = useState<HealthToday | null>(null);
  const [busy, setBusy] = useState(false);
  const provider = health.provider ?? (Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect');
  const first = tenant.coach.name.split(' ')[0];

  useEffect(() => {
    let live = true;
    void health.isAvailable().then((a) => live && setAvailable(a));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (status !== 'connected' || !open) return;
    let live = true;
    void health.readToday().then((t) => live && setToday(t));
    return () => {
      live = false;
    };
  }, [status, open]);

  const subtitle =
    available === false
      ? Platform.OS === 'web'
        ? 'Available in the iPhone and Android app'
        : `${provider} isn’t available on this phone`
      : status === 'connected'
        ? `Connected · sleep, heart rate, workouts and food`
        : status === 'denied'
          ? `Access is off. Turn it on in ${provider}.`
          : `Bring in sleep, heart rate and workouts${Platform.OS === 'ios' ? ' (Apple Watch too)' : ''}`;

  const connect = async () => {
    setBusy(true);
    const r = await health.connect();
    setBusy(false);
    set(r === 'granted' ? 'connected' : r === 'denied' ? 'denied' : 'not_connected');
    if (r === 'unavailable') setAvailable(false);
    if (r === 'granted') void useHealthImports.getState().refresh();
  };

  return (
    <>
      <ListRow title={`Health app${health.provider ? ` · ${health.provider}` : ''}`} subtitle={subtitle} chevron={available !== false} onPress={available === false ? undefined : () => setOpen(true)} />
      <Sheet visible={open} title={provider} onClose={() => setOpen(false)}>
        <View style={styles.body}>
          {status === 'connected' ? (
            <>
              <Text color="ink2">{`Read only. Spotter never writes to ${provider}.`}</Text>
              {Platform.OS === 'ios' ? (
                <Text variant="caption" color="ink2">
                  Apple Watch data comes through Apple Health. There’s nothing else to connect.
                </Text>
              ) : null}
              <Reading label="Steps today" value={today?.steps != null ? formatNumber(today.steps) : null} />
              <Reading
                label="Bodyweight"
                value={today?.bodyweightKg != null ? `${formatNumber(today.bodyweightKg)} kg` : null}
                note={today?.bodyweightAt ? `Measured ${new Date(today.bodyweightAt).toLocaleDateString()}` : undefined}
              />
              <Reading label="Sleep last night" value={today?.sleepHours != null ? `${formatNumber(today.sleepHours)} h` : null} />
              <Imported />
              <Button label="Check access again" kind="secondary" loading={busy} onPress={() => void connect()} accessibilityHint="Asks for any new data types Spotter reads" />
              <Button label={`Manage access in ${provider}`} kind="secondary" onPress={() => health.openSettings()} />
              <Button label="Disconnect" kind="quiet" onPress={() => { set('not_connected'); setToday(null); setOpen(false); useHealthImports.getState().clear(); }} />
              <Text variant="caption" color="ink2">
                {`Disconnecting stops Spotter reading new data. To remove the permission completely, turn it off in ${provider}.`}
              </Text>
            </>
          ) : status === 'denied' ? (
            <>
              <Text>{`Spotter can’t read from ${provider} right now. Turn on steps, weight and sleep for Spotter in ${provider}, then try again.`}</Text>
              <Button label={`Open ${provider}`} onPress={() => health.openSettings()} />
              <Button label="Try again" kind="secondary" loading={busy} onPress={() => void connect()} />
            </>
          ) : (
            <>
              <Text>{`Connect ${provider} so you never type in what’s already there: sleep, heart rate variability, resting heart rate, workouts from other apps, and food totals from apps like MyMacros or MyFitnessPal. Spotter only reads; it never changes your health data.`}</Text>
              {Platform.OS === 'ios' ? (
                <Text variant="caption" color="ink2">
                  Apple Watch data comes through Apple Health.
                </Text>
              ) : null}
              <Text variant="caption" color="ink2">
                {`${first} sees your daily brief in plain words (when you share it), never your raw heart-rate numbers. Cycle data is only read if you turn on cycle tracking.`}
              </Text>
              <Button label={`Connect ${provider}`} loading={busy} onPress={() => void connect()} />
            </>
          )}
        </View>
      </Sheet>
    </>
  );
}

/** What's been imported, with a per-type on/off for workouts. */
function Imported() {
  const days = useHealthImports((st) => st.wearableDays);
  const nutrition = useHealthImports((st) => st.nutritionDays);
  const workouts = useHealthImports((st) => st.workouts);
  const hidden = useHealthImports((st) => st.hiddenActivities);
  const setActivityOn = useHealthImports((st) => st.setActivityOn);
  const types = [...new Set(workouts.map((w) => w.activity))] as ImportedActivity[];
  const apps = [...new Set(nutrition.flatMap((n) => n.sources))];
  const hrvDays = days.filter((d) => d.hrvMs != null).length;
  const rhrDays = days.filter((d) => d.restingHr != null).length;
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="label" color="ink2">
        Imported, last 28 days
      </Text>
      <Text variant="callout">{`Heart rate variability: ${hrvDays} days · Resting heart rate: ${rhrDays} days`}</Text>
      <Text variant="callout">{apps.length ? `Food totals: ${nutrition.length} days, from ${apps.join(', ')}` : 'Food totals: none written by other apps'}</Text>
      {types.length ? (
        types.map((t) => (
          <PainToggle
            key={t}
            label={`${IMPORTED_ACTIVITY_LABEL[t]} (${workouts.filter((w) => w.activity === t).length})`}
            value={!hidden.includes(t)}
            onChange={(on) => setActivityOn(t, on)}
          />
        ))
      ) : (
        <Text variant="callout">Workouts: none recorded outside Spotter</Text>
      )}
      <Text variant="caption" color="ink2">
        Workouts that are on count toward your training load and show in History. One that overlaps a Spotter session is treated as that session.
      </Text>
    </View>
  );
}

function Reading({ label, value, note }: { label: string; value: string | null; note?: string }) {
  return (
    <View style={styles.reading} accessible accessibilityLabel={`${label}: ${value ?? 'no data yet'}`}>
      <Text variant="label" color="ink2">
        {label}
      </Text>
      <Text variant="figure" tabular color={value ? 'ink' : 'ink2'}>
        {value ?? 'No data yet'}
      </Text>
      {note ? (
        <Text variant="caption" color="ink2">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, gap: space[3], paddingBottom: space[2] },
  reading: { gap: 2 },
});
