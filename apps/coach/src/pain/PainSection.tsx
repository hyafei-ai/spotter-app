import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BODY_REGION_LABEL, ongoingPain, painText, type TriageItem } from '@spotter/core';
import { EMPTY_SHARED_PAIN, isoDay, painKey, type SharedPainDoc } from '@spotter/core/demo';
import { SectionLabel, Text, margin, onSharedChange, readShared, space } from '@spotter/ui';
import { isConfigured } from '@spotter/ui/platform';
import { tenant } from '../env';
import { useCoach } from '../store';

/*
 * Client detail → Pain (docs/features/brief.md). Only logs the client shared (on by default, per log),
 * plus region-load warnings from their training. Real builds read pain_logs (the coach policy returns
 * shared rows only). MOCK: the demo client app writes the same projection to `spotter.pain.<tenant>`.
 */

/** The shared pain document, kept fresh when the client app writes to it. */
export function usePainDoc(): SharedPainDoc | null {
  const [doc, setDoc] = useState<SharedPainDoc | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void readShared<SharedPainDoc>(painKey(tenant.slug), EMPTY_SHARED_PAIN).then((d) => live && setDoc(d));
    load();
    const off = onSharedChange((key) => key === painKey(tenant.slug) && load());
    return () => {
      live = false;
      off();
    };
  }, []);
  return doc;
}

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

export function PainSection({ clientId }: { clientId: string }) {
  const doc = usePainDoc();
  const client = useCoach((s) => s.clients.find((c) => c.id === clientId));
  const first = client?.name.split(' ')[0] ?? 'This client';
  const logs = doc?.pain[clientId] ?? [];
  const spikes = (doc?.regions[clientId]?.regions ?? []).filter((r) => r.spike);
  if (!logs.length && !spikes.length) return null;
  const today = isoDay(0);
  const ongoing = ongoingPain(logs, today);
  const recent = logs.filter((l) => l.date > isoDay(-14)).reverse().slice(0, 5);

  return (
    <>
      <SectionLabel>Pain</SectionLabel>
      <View style={styles.body}>
        {ongoing.map((p) => (
          <Text key={p.region} variant="bodyStrong">
            {painText(p)}
          </Text>
        ))}
        {spikes.map((r) => (
          <Text key={r.region} variant="callout">{`${BODY_REGION_LABEL[r.region]} load this week is ${r.ratio}× usual`}</Text>
        ))}
        {recent.map((l) => (
          <Text key={l.id} variant="caption" color="ink2">
            {`${day(l.date)} · ${BODY_REGION_LABEL[l.region]}${l.side && l.side !== 'both' ? ` (${l.side})` : ''} ${l.level}/10${l.note ? ` · “${l.note}”` : ''}`}
          </Text>
        ))}
        <Text variant="caption" color="ink2">
          {`What ${first} chose to share. ${first} was told to stop an exercise that hurts above 3/10 and tell you. Not a diagnosis.`}
        </Text>
      </View>
    </>
  );
}

/**
 * Demo stand-in for raise_pain_ongoing: shared pain on 3+ of the last 14 days (or 6/10+) reaches the
 * Clients list as "Pain logged 3 days running: knee". Connected builds get it from triage_items.
 */
export function usePainTriage() {
  const doc = usePainDoc();
  useEffect(() => {
    if (isConfigured() || !doc) return;
    const today = isoDay(0);
    const existing = new Set(useCoach.getState().triage.map((t) => t.id));
    const add: TriageItem[] = [];
    for (const [clientId, logs] of Object.entries(doc.pain)) {
      for (const p of ongoingPain(logs, today)) {
        const id = `pain-${clientId}-${p.region}-${p.latestDate}`;
        if (existing.has(id)) continue;
        const where = p.region.replace('_', ' ');
        const detail = p.streak >= 3 ? `Pain logged ${p.streak} days running: ${where}` : p.days >= 3 ? `Pain logged ${p.days} of the last 14 days: ${where}` : `Pain at ${p.maxLevel}/10: ${where}`;
        add.push({ id, clientId, reason: 'pain_ongoing', count: p.days, detail, since: `${p.latestDate}T07:00:00.000Z`, snoozedUntil: null, handledAt: null });
      }
    }
    if (add.length) useCoach.setState((s) => ({ triage: [...s.triage, ...add] }));
  }, [doc]);
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingVertical: space[2], gap: space[1] },
});
