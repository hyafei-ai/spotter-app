import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { formatNumber } from '@spotter/core';
import { Button, ListRow, Sheet, Text, margin, space } from '@spotter/ui';
import { kv } from '../storage';
import { tenant } from '../env';
import { health } from './source';
import type { HealthToday } from './types';

type Status = 'not_connected' | 'connected' | 'denied';

const useHealthStatus = create<{ status: Status; set: (s: Status) => void }>()(
  persist((set) => ({ status: 'not_connected', set: (status) => set({ status }) }), {
    name: 'spotter.health',
    storage: createJSONStorage(() => kv),
    partialize: ({ status }) => ({ status }),
  }),
);

/** Me → connected health app (C-10). Read-only: steps, bodyweight and sleep. */
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
        ? `Connected · steps, bodyweight and sleep`
        : status === 'denied'
          ? `Access is off. Turn it on in ${provider}.`
          : `Share steps, bodyweight and sleep with ${first}`;

  const connect = async () => {
    setBusy(true);
    const r = await health.connect();
    setBusy(false);
    set(r === 'granted' ? 'connected' : r === 'denied' ? 'denied' : 'not_connected');
    if (r === 'unavailable') setAvailable(false);
  };

  return (
    <>
      <ListRow title={`Health app${health.provider ? ` · ${health.provider}` : ''}`} subtitle={subtitle} chevron={available !== false} onPress={available === false ? undefined : () => setOpen(true)} />
      <Sheet visible={open} title={provider} onClose={() => setOpen(false)}>
        <View style={styles.body}>
          {status === 'connected' ? (
            <>
              <Text color="ink2">{`Read only. ${first} sees these numbers next to your training. Spotter never writes to ${provider}.`}</Text>
              <Reading label="Steps today" value={today?.steps != null ? formatNumber(today.steps) : null} />
              <Reading
                label="Bodyweight"
                value={today?.bodyweightKg != null ? `${formatNumber(today.bodyweightKg)} kg` : null}
                note={today?.bodyweightAt ? `Measured ${new Date(today.bodyweightAt).toLocaleDateString()}` : undefined}
              />
              <Reading label="Sleep last night" value={today?.sleepHours != null ? `${formatNumber(today.sleepHours)} h` : null} />
              <Button label={`Manage access in ${provider}`} kind="secondary" onPress={() => health.openSettings()} />
              <Button label="Disconnect" kind="quiet" onPress={() => { set('not_connected'); setToday(null); setOpen(false); }} />
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
              <Text>{`Connect ${provider} so ${first} can see your steps, bodyweight and sleep alongside your training. Spotter only reads; it never changes your health data.`}</Text>
              <Button label={`Connect ${provider}`} loading={busy} onPress={() => void connect()} />
            </>
          )}
        </View>
      </Sheet>
    </>
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
