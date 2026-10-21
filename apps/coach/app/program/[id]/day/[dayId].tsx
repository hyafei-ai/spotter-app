import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  WEEKDAY_LONG,
  copyDay,
  findDay,
  move,
  newExercise,
  relabelSupersets,
  toggleSupersetWithNext,
  updateDay,
  type ProgramDay,
} from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, Sheet, Tag, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { DEMO_CLIENTS } from '@spotter/core/demo';
import { useEditing, useLibrary, usePrograms } from '../../../../src/programs';
import { ExercisePicker, WeekdayPicker } from '../../../../src/programUi';
import { confirm } from '../../../../src/confirm';
import { describeInUnit, longDate } from '../../../../src/format';

/** One session: name, day of the week, coach note and exercises. Also edits a single client's session for one date. */
export default function DayEditor() {
  const { id, dayId } = useLocalSearchParams<{ id: string; dayId: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const library = useLibrary();
  const { program, draft } = useEditing(id);
  const { change, save, discard, clearOverride, assignments } = usePrograms();
  const [picking, setPicking] = useState(false);
  const [copying, setCopying] = useState(false);
  const found = program ? findDay(program, dayId) : null;

  const isOverride = draft?.target.type === 'override';
  const overrideTarget = draft?.target.type === 'override' ? draft.target : null;
  const assignment = overrideTarget ? assignments.find((a) => a.id === overrideTarget.assignmentId) : null;
  const client = assignment ? DEMO_CLIENTS.find((c) => c.id === assignment.clientId) : null;
  const hadOverride = !!(assignment && overrideTarget && assignment.overrides[overrideTarget.date]);

  const back = () => {
    const go = () => (router.canGoBack() ? router.back() : router.replace(isOverride && client ? `/client/${client.id}` : `/program/${id}`));
    if (isOverride && draft?.dirty) {
      confirm('Discard changes?', 'Your edits to this session haven’t been saved.', 'Discard', () => {
        discard(id);
        go();
      });
      return;
    }
    if (isOverride) discard(id);
    go();
  };

  if (!program || !found) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/programs'))} />
        </View>
        <EmptyState message="This session was removed." actionLabel="Back to programs" onAction={() => router.replace('/programs')} />
      </Screen>
    );
  }

  const { day, weekIndex, week } = found;
  const setDay = (fn: (d: ProgramDay) => ProgramDay) => change(id, updateDay(program, day.id, fn));

  const saveOverride = () => {
    const res = save(id);
    if (!res.ok) return toast({ message: res.problems[0]! });
    toast({ message: `Saved. ${client?.name.split(' ')[0] ?? 'Your client'} sees this session on ${overrideTarget ? longDate(overrideTarget.date) : 'that day'}.` });
    router.back();
  };

  return (
    <Screen
      footer={
        isOverride ? (
          <>
            <Button label="Save this session" onPress={saveOverride} disabled={!draft?.dirty && !hadOverride} disabledReason={!draft?.dirty && !hadOverride ? 'No changes yet' : undefined} />
            {hadOverride && overrideTarget ? (
              <Button
                label="Go back to the programmed session"
                kind="quiet"
                onPress={() => {
                  clearOverride(overrideTarget.assignmentId, overrideTarget.date);
                  discard(id);
                  toast({ message: 'Back to the programmed session.' });
                  router.back();
                }}
              />
            ) : null}
          </>
        ) : (
          <Button label="Done" onPress={() => router.back()} />
        )
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label={isOverride ? 'Back' : 'Back to the program'} onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          {isOverride && overrideTarget
            ? `${client?.name ?? 'Client'} · ${longDate(overrideTarget.date)} only`
            : `${program.name || 'Program'} · week ${weekIndex + 1}`}
        </Text>
        <TextField label="Session name" value={day.title} onChangeText={(title) => setDay((d) => ({ ...d, title }))} placeholder="e.g. Lower A" />
        {!isOverride ? (
          <View style={{ gap: space[2] }}>
            <Text variant="label" color="ink2">
              Day of the week · {WEEKDAY_LONG[day.weekday - 1]}
            </Text>
            <WeekdayPicker
              value={day.weekday}
              taken={week.days.filter((d) => d.id !== day.id).map((d) => d.weekday)}
              onChange={(weekday) => {
                const p = updateDay(program, day.id, (d) => ({ ...d, weekday }));
                change(id, { ...p, weeks: p.weeks.map((w, i) => (i === weekIndex ? { ...w, days: [...w.days].sort((a, b) => a.weekday - b.weekday) } : w)) });
              }}
            />
          </View>
        ) : (
          <Text variant="callout" color="ink2">
            Only this date changes. The program and other clients stay as they are.
          </Text>
        )}
        <TextField
          label="Note for the client (optional)"
          value={day.coachNote ?? ''}
          onChangeText={(t) => setDay((d) => ({ ...d, coachNote: t || null }))}
          placeholder="Shown above the exercise list, in your words"
          multiline
        />
      </View>

      <SectionLabel>{`${day.exercises.length} exercise${day.exercises.length === 1 ? '' : 's'}`}</SectionLabel>
      {day.exercises.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          No exercises yet. Add the first one below.
        </Text>
      ) : (
        day.exercises.map((e, i) => {
          const joined = !!e.supersetGroup && day.exercises[i + 1]?.supersetGroup === e.supersetGroup;
          return (
            <View key={e.id} style={[styles.exRow, { borderBottomColor: colors.line }]}>
              <View style={{ flex: 1 }}>
                <ListRow
                  title={e.name}
                  subtitle={`${describeInUnit(e)} · rest ${e.restS ? `${e.restS} s` : 'none'}`}
                  right={e.supersetGroup ? <Tag label={`Superset ${e.supersetGroup}`} /> : e.progressionRule ? <Tag label="Progression" tone="brand" /> : undefined}
                  chevron
                  last
                  onPress={() => router.push(`/program/${id}/exercise/${e.id}`)}
                />
              </View>
              <View style={styles.exActions}>
                <IconButton icon="arrow-up" label={`Move ${e.name} up`} onPress={() => setDay((d) => ({ ...d, exercises: relabelSupersets(move(d.exercises, i, -1)) }))} />
                <IconButton icon="arrow-down" label={`Move ${e.name} down`} onPress={() => setDay((d) => ({ ...d, exercises: relabelSupersets(move(d.exercises, i, 1)) }))} />
                {i < day.exercises.length - 1 ? (
                  <IconButton
                    icon={joined ? 'scissors' : 'link'}
                    label={joined ? `Split ${e.name} from the next exercise` : `Superset ${e.name} with the next exercise`}
                    onPress={() => setDay((d) => toggleSupersetWithNext(d, i))}
                  />
                ) : (
                  <View style={{ width: 48 }} />
                )}
                <IconButton
                  icon="trash-2"
                  label={`Remove ${e.name}`}
                  onPress={() => setDay((d) => ({ ...d, exercises: relabelSupersets(d.exercises.filter((x) => x.id !== e.id)) }))}
                />
              </View>
            </View>
          );
        })
      )}

      <View style={[styles.body, { gap: space[2] }]}>
        <Button label="Add an exercise" icon="plus" kind="secondary" onPress={() => setPicking(true)} />
        {!isOverride && program.weeks.length > 1 ? (
          <Button label="Copy this day to another week" icon="copy" kind="quiet" onPress={() => setCopying(true)} />
        ) : null}
        {!isOverride ? (
          <Button
            label="Delete this day"
            icon="trash-2"
            kind="quiet"
            onPress={() =>
              confirm('Delete this day?', `${day.title || 'This session'} and its exercises will be removed from week ${weekIndex + 1}.`, 'Delete', () => {
                change(id, { ...program, weeks: program.weeks.map((w, i) => (i === weekIndex ? { ...w, days: w.days.filter((d) => d.id !== day.id) } : w)) });
                router.back();
              })
            }
          />
        ) : null}
      </View>

      <ExercisePicker
        visible={picking}
        title="Add an exercise"
        library={library}
        onClose={() => setPicking(false)}
        onPick={(ex) => {
          const pe = newExercise(ex);
          setDay((d) => ({ ...d, exercises: [...d.exercises, pe] }));
          setPicking(false);
          router.push(`/program/${id}/exercise/${pe.id}`);
        }}
      />

      <Sheet visible={copying} title="Copy to which week?" onClose={() => setCopying(false)}>
        {program.weeks.map((w, wi) =>
          wi === weekIndex ? null : (
            <ListRow
              key={w.id}
              title={`Week ${wi + 1}`}
              subtitle={
                w.days.some((d) => d.weekday === day.weekday)
                  ? `Replaces ${w.days.find((d) => d.weekday === day.weekday)!.title || 'the session'} on ${WEEKDAY_LONG[day.weekday - 1]}`
                  : `Adds it on ${WEEKDAY_LONG[day.weekday - 1]}`
              }
              onPress={() => {
                change(id, copyDay(program, day.id, wi));
                setCopying(false);
                toast({ message: `Copied to week ${wi + 1}.` });
              }}
            />
          ),
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[4] },
  body: { paddingHorizontal: margin, paddingTop: space[4] },
  exRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  exActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space[2], marginTop: -space[3] },
});
