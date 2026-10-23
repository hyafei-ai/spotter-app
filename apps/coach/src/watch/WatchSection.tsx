import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { recoveryDropLine } from '@spotter/core';
import { DEMO_CLIENT, EMPTY_SHARED_WATCH, coachClientIdFor, demoWatchHistory, watchKey, type SharedWatchDoc } from '@spotter/core/demo';
import { SectionLabel, Text, margin, onSharedChange, readShared, space } from '@spotter/ui';
import { tenant } from '../env';
import { useCoach } from '../store';

/*
 * Client detail → Watch sessions (docs/features/watch.md): heart-rate recovery after sessions logged on the
 * client's Apple Watch, as the client's own trend. Only while the client shares "Heart rate from watch sessions".
 * Real builds read session_watch_summaries (RLS returns shared rows only). MOCK: the demo client app writes the
 * same summaries to `spotter.watch.<tenant>`; two earlier sample sessions give the demo client a trend.
 */

function useWatchDoc(): SharedWatchDoc | null {
  const [doc, setDoc] = useState<SharedWatchDoc | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void readShared<SharedWatchDoc>(watchKey(tenant.slug), EMPTY_SHARED_WATCH).then((d) => live && setDoc(d));
    load();
    const off = onSharedChange((key) => key === watchKey(tenant.slug) && load());
    return () => {
      live = false;
      off();
    };
  }, []);
  return doc;
}

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

export function WatchSection({ clientId }: { clientId: string }) {
  const doc = useWatchDoc();
  const client = useCoach((s) => s.clients.find((c) => c.id === clientId));
  if (!doc || doc.hidden?.[clientId]) return null;
  const isDemoClient = clientId === coachClientIdFor(DEMO_CLIENT.id);
  const sessions = [...(isDemoClient ? demoWatchHistory() : []), ...(doc.sessions[clientId] ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
  if (!sessions.length) return null;
  const first = client?.name.split(' ')[0] ?? 'This client';
  const latest = sessions[sessions.length - 1]!;
  const drops = sessions.map((s) => s.hrr60).filter((x): x is number => x != null);
  const line = recoveryDropLine(latest.hrr60, latest.hrr120);
  const real = doc.sessions[clientId]?.length ?? 0;
  const mockNote = !isDemoClient ? '' : real ? ' The earlier sessions are sample data (MOCK).' : ' Sample data (MOCK) until a session is logged on the watch.';

  return (
    <>
      <SectionLabel>Watch sessions</SectionLabel>
      <View style={styles.body}>
        <Text variant="bodyStrong">{`${latest.title}, ${day(latest.date)}${line ? `: heart rate ${line.charAt(0).toLowerCase()}${line.slice(1)}` : ''}`}</Text>
        {latest.avgHr != null && latest.maxHr != null ? <Text variant="callout">{`Average ${latest.avgHr} bpm, peak ${latest.maxHr} bpm`}</Text> : null}
        {drops.length >= 2 ? (
          <Text variant="callout">{`First-minute drop, last ${drops.length} watch sessions: ${drops.join(' → ')} bpm`}</Text>
        ) : null}
        <Text variant="caption" color="ink2">
          {`From ${first}’s Apple Watch, shared by ${first}. Compare it with their own earlier sessions; one session on its own says little.${mockNote}`}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({ body: { paddingHorizontal: margin, paddingVertical: space[2], gap: space[1] } });
