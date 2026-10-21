import { useEffect } from 'react';
import { router } from 'expo-router';
import { ListRow, Tag } from '@spotter/ui';
import { tenant } from '../env';
import { longDate } from '../format';
import { useCheckIns, useDueState } from '../checkins/store';
import { useFormChecks, useMergedChecks } from './store';
import { loadSeenReplies, useSeenReplies } from './seen';
import { useDueVisible } from '../DueItems';

const first = () => tenant.coach.name.split(' ')[0];

/** Today → Due: the weekly check-in when it's due or overdue (C-3, C-7). */
export function CheckInDueRow() {
  const loaded = useCheckIns((s) => s.loaded);
  const load = useCheckIns((s) => s.load);
  const state = useDueState();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const show = !!state && (state.kind === 'due_today' || state.kind === 'overdue');
  useDueVisible(show);
  if (!state || !show) return null;
  const overdue = state.kind === 'overdue';
  return (
    <ListRow
      title="Weekly check-in"
      subtitle={
        overdue
          ? `Was due ${longDate(state.dueDate)}`
          : 'A few minutes: weight, sleep, how the week went'
      }
      right={
        <Tag
          label={
            overdue ? (state.days === 1 ? '1 day late' : `${state.days} days late`) : 'Due today'
          }
          tone={overdue ? 'warning' : 'brand'}
        />
      }
      chevron
      onPress={() => router.push(`/check-in/${state.dueDate}`)}
    />
  );
}

/** Today → Due: a lift the coach asked to see on video. */
export function FormCheckRequestRow() {
  const loaded = useFormChecks((s) => s.loaded);
  const load = useFormChecks((s) => s.load);
  const requests = useFormChecks((s) => s.requests);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const open = requests.filter((r) => !r.fulfilledBy);
  useDueVisible(open.length > 0);
  if (!open.length) return null;
  return (
    <>
      {open.map((r) => (
        <ListRow
          key={r.id}
          title={`Form check: ${r.exerciseName}`}
          subtitle={`${first()} asked to see a set on video`}
          right={<Tag label="Requested" tone="brand" />}
          chevron
          onPress={() => router.push('/form-check/new')}
        />
      ))}
    </>
  );
}

/** Today → Due: a coach reply the client hasn't opened yet. */
export function FormCheckReplyRow() {
  const loaded = useFormChecks((s) => s.loaded);
  const load = useFormChecks((s) => s.load);
  const checks = useMergedChecks();
  const seen = useSeenReplies((s) => s.seen);
  const seenLoaded = useSeenReplies((s) => s.loaded);
  useEffect(() => {
    if (!loaded) void load();
    void loadSeenReplies();
  }, [loaded, load]);
  const fresh = seenLoaded
    ? checks.filter((c) => c.upload.status === 'replied' && !seen.has(c.id))
    : [];
  useDueVisible(fresh.length > 0);
  if (!fresh.length) return null;
  return (
    <>
      {fresh.map((c) => (
        <ListRow
          key={c.id}
          title={`${first()} replied: ${c.exerciseName}`}
          subtitle="Notes and drawings on your video"
          right={<Tag label="New" tone="brand" />}
          chevron
          onPress={() => router.push(`/form-check/${c.id}`)}
        />
      ))}
    </>
  );
}
