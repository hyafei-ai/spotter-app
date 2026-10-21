import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { formatWeight, uploadLabel } from '@spotter/core';
import { tenant } from '../env';
import { LOWER_A } from '@spotter/core/demo';
import { Button, ListRow, SectionLabel, Sheet, Tag, Text, useToast, margin, space } from '@spotter/ui';
import { View } from 'react-native';
import { reviewedAt, useMedia, withReply } from './store';

const short = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Client detail (K-3): recent form checks, newest first, with a way to ask for one. */
export function FormChecksSection({ clientId }: { clientId: string }) {
  const toast = useToast();
  const { loaded, load, formChecks, replies, requests, requestFormCheck } = useMedia();
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const mine = formChecks
    .filter((c) => c.clientId === clientId)
    .map((c) => withReply(c, replies))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  // MOCK: requests reach only the demo client (Jordan) on the web preview.
  const openRequests = requests.filter((r) => !r.fulfilledBy);

  return (
    <>
      <SectionLabel right={<Button label="Ask for one" kind="quiet" full={false} onPress={() => setAsking(true)} />}>Form checks</SectionLabel>
      {mine.length === 0 ? (
        <Text color="ink2" style={{ paddingHorizontal: margin, paddingTop: space[3] }}>
          No form checks yet.
        </Text>
      ) : (
        mine.map((c, i) => (
          <ListRow
            key={c.id}
            title={`${c.exerciseName} · ${short(c.createdAt)}`}
            subtitle={c.setLabel ?? undefined}
            reason={c.upload.status === 'sent' ? 'Waiting for your feedback' : undefined}
            right={c.upload.status === 'replied' ? <Tag label="Replied" /> : c.upload.status !== 'sent' ? <Tag label={uploadLabel(c.upload)} /> : undefined}
            chevron
            last={i === mine.length - 1}
            onPress={() => router.push(`/form-check/${c.id}/review`)}
          />
        ))
      )}
      {openRequests.length ? (
        <Text variant="caption" color="ink2" style={{ paddingHorizontal: margin, paddingTop: space[2] }}>
          Asked for: {openRequests.map((r) => r.exerciseName).join(', ')}
        </Text>
      ) : null}
      <Sheet visible={asking} title="Ask for a form check" onClose={() => setAsking(false)}>
        {LOWER_A.exercises.map((e, i) => (
          <ListRow
            key={e.id}
            title={e.name}
            last={i === LOWER_A.exercises.length - 1}
            onPress={() => {
              void requestFormCheck(e.exerciseId, e.name);
              setAsking(false);
              toast({ message: `Asked for a form check on ${e.name}` });
            }}
          />
        ))}
        <View style={{ height: space[2] }} />
      </Sheet>
    </>
  );
}

/** Client detail (K-3): weekly check-ins, newest first. */
export function CheckInsSection({ clientId }: { clientId: string }) {
  const { loaded, load, checkIns, reviews } = useMedia();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const mine = checkIns.filter((c) => c.clientId === clientId).sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, 4);
  return (
    <>
      <SectionLabel>Check-ins</SectionLabel>
      {mine.length === 0 ? (
        <Text color="ink2" style={{ paddingHorizontal: margin, paddingTop: space[3] }}>
          No check-ins yet.
        </Text>
      ) : (
        mine.map((c, i) => {
          const a = c.answers;
          const bits = [
            a.bodyweightKg != null ? formatWeight(a.bodyweightKg, tenant.units) : null,
            a.sleepHours != null ? `${a.sleepHours} h sleep` : null,
            c.photos.length ? `${c.photos.length} photo${c.photos.length === 1 ? '' : 's'}` : null,
          ].filter(Boolean);
          return (
            <ListRow
              key={c.id}
              title={`Due ${short(c.dueDate)}`}
              subtitle={bits.join(' · ') || undefined}
              reason={reviewedAt(c, reviews) ? undefined : 'Not read yet'}
              chevron
              last={i === mine.length - 1}
              onPress={() => router.push(`/check-in/${c.id}`)}
            />
          );
        })
      )}
    </>
  );
}

/** Me tab row: the weekly check-in template. */
export function CheckInTemplateRow() {
  const { loaded, load, template } = useMedia();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const n = Object.values(template.fields).filter((v) => v === true).length + template.fields.measurements.length;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return <ListRow title="Weekly check-in" subtitle={`${n} questions · due ${days[template.dueWeekday]}s`} chevron onPress={() => router.push('/check-ins/template')} />;
}
