import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  WEEKDAY_LONG,
  addExerciseToDay,
  copyDay,
  dayBlocks,
  findDay,
  move,
  moveDayBlock,
  newExercise,
  newWorkoutBlock,
  removeDayBlock,
  setDayBlocks,
  toggleSupersetWithNext,
  updateDay,
  updateDayBlock,
  type Block,
  type DayBriefState,
  type ProgramDay,
} from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, Sheet, Tag, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { DEMO_CLIENTS } from '@spotter/core/demo';
import { useEditing, useLibrary, usePrograms } from '../../../../src/programs';
import { ExercisePicker, WeekdayPicker } from '../../../../src/programUi';
import { confirm } from '../../../../src/confirm';
import { describeInUnit, longDate } from '../../../../src/format';
import { BlockPicker, BlockSummary } from '../../../../src/multisport/ui';

/**
 * One session: name, day of the week, coach note and its parts in order (docs/ux/multisport.md 5.1). A strength part
 * is the exercise list it always was; other parts (AMRAP, intervals, a race sim…) are one row each. Also edits a
 * single client's session for one date.
 */
export default function DayEditor() {
  const { id, dayId } = useLocalSearchParams<{ id: string; dayId: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const library = useLibrary();
  const { program, draft } = useEditing(id);
  const { change, save, discard, clearOverride, assignments, setDayBrief } = usePrograms();
  const [picker, setPicker] = useState(false);
  const [exerciseFor, setExerciseFor] = useState<string | 'new' | null>(null);
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
  const blocks = dayBlocks(day);
  const exById = new Map(day.exercises.map((e) => [e.id, e]));
  const parts = blocks.filter((b) => b.kind !== 'strength' || b.exerciseIds.length > 0).length;
  // A day with one plain strength part looks exactly as it always did: no "Strength" header.
  const plain = blocks.length === 1 && blocks[0]!.kind === 'strength' && !blocks[0]!.title;

  const saveOverride = () => {
    const res = save(id);
    if (!res.ok) return toast({ message: res.problems[0]! });
    toast({ message: `Saved. ${client?.name.split(' ')[0] ?? 'Your client'} sees this session on ${overrideTarget ? longDate(overrideTarget.date) : 'that day'}.` });
    router.back();
  };

  const addKind = (kind: Block['kind']) => {
    setPicker(false);
    if (kind === 'strength') return setExerciseFor('new');
    const b = newWorkoutBlock(kind);
    setDay((d) => setDayBlocks(d, [...dayBlocks(d), b]));
    router.push(`/program/${encodeURIComponent(id)}/block/${b.id}?day=${day.id}`);
  };

  const removeBlock = (b: Block) => {
    const before = program;
    setDay((d) => removeDayBlock(d, b.id));
    toast({ message: 'Removed.', actionLabel: 'Undo', onAction: () => change(id, before) });
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
          {isOverride && overrideTarget ? `${client?.name ?? 'Client'} · ${longDate(overrideTarget.date)} only` : `${program.name || 'Program'} · week ${weekIndex + 1}`}
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
          placeholder="Shown above the session, in your words"
          multiline
        />
      </View>

      {day.brief && !isOverride ? <BriefCard brief={day.brief} onChange={(b) => setDayBrief(id, day.id, b)} /> : null}

      <SectionLabel>{plain ? `${day.exercises.length} exercise${day.exercises.length === 1 ? '' : 's'}` : `${parts} part${parts === 1 ? '' : 's'}`}</SectionLabel>
      {blocks.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          Nothing in this session yet. Add the first part below.
        </Text>
      ) : (
        blocks.map((b, bi) => {
          const blockActions = !plain ? (
            <View style={styles.blockActions}>
              <IconButton icon="arrow-up" label={`Move ${b.kind === 'strength' ? 'the strength part' : blockTitle(b)} up`} onPress={() => setDay((d) => moveDayBlock(d, bi, -1))} />
              <IconButton icon="arrow-down" label={`Move ${b.kind === 'strength' ? 'the strength part' : blockTitle(b)} down`} onPress={() => setDay((d) => moveDayBlock(d, bi, 1))} />
              <IconButton icon="trash-2" label={`Remove ${b.kind === 'strength' ? 'the strength part' : blockTitle(b)}`} onPress={() => removeBlock(b)} />
            </View>
          ) : null;
          if (b.kind !== 'strength') {
            return (
              <View key={b.id} style={[styles.blockCard, { borderBottomColor: colors.line }]}>
                <BlockSummary block={b} divider={false} onPress={() => router.push(`/program/${encodeURIComponent(id)}/block/${b.id}?day=${day.id}`)} />
                {blockActions}
              </View>
            );
          }
          const ex = b.exerciseIds.map((x) => exById.get(x)).filter((e): e is ProgramDay['exercises'][number] => !!e);
          return (
            <View key={b.id}>
              {!plain ? (
                <View style={[styles.strengthHead, { borderBottomColor: colors.line }]}>
                  <Text variant="label" color="ink2" style={{ flex: 1 }}>
                    {b.title && b.title.toLowerCase() !== 'strength' ? `Strength · ${b.title}` : 'Strength'}
                  </Text>
                  {blockActions}
                </View>
              ) : null}
              {ex.map((e, i) => {
                const gi = day.exercises.findIndex((x) => x.id === e.id);
                const nextInBlock = ex[i + 1];
                const joined = !!e.supersetGroup && nextInBlock?.supersetGroup === e.supersetGroup;
                return (
                  <View key={e.id} style={[styles.exRow, { borderBottomColor: colors.line }]}>
                    <View style={{ flex: 1 }}>
                      <ListRow
                        title={e.name}
                        subtitle={`${describeInUnit(e)} · rest ${e.restS ? `${e.restS} s` : 'none'}`}
                        right={e.supersetGroup ? <Tag label={`Superset ${e.supersetGroup}`} /> : e.progressionRule ? <Tag label="Progression" tone="brand" /> : undefined}
                        chevron
                        last
                        onPress={() => router.push(`/program/${encodeURIComponent(id)}/exercise/${e.id}`)}
                      />
                    </View>
                    <View style={styles.exActions}>
                      <IconButton icon="arrow-up" label={`Move ${e.name} up`} onPress={() => setDay((d) => updateDayBlock(d, b.id, (x) => (x.kind === 'strength' ? { ...x, exerciseIds: move(x.exerciseIds, i, -1) } : x)))} />
                      <IconButton icon="arrow-down" label={`Move ${e.name} down`} onPress={() => setDay((d) => updateDayBlock(d, b.id, (x) => (x.kind === 'strength' ? { ...x, exerciseIds: move(x.exerciseIds, i, 1) } : x)))} />
                      {nextInBlock ? (
                        <IconButton
                          icon={joined ? 'scissors' : 'link'}
                          label={joined ? `Split ${e.name} from the next exercise` : `Superset ${e.name} with the next exercise`}
                          onPress={() => setDay((d) => toggleSupersetWithNext(d, gi))}
                        />
                      ) : (
                        <View style={{ width: 48 }} />
                      )}
                      <IconButton
                        icon="trash-2"
                        label={`Remove ${e.name}`}
                        onPress={() => setDay((d) => updateDayBlock(d, b.id, (x) => (x.kind === 'strength' ? { ...x, exerciseIds: x.exerciseIds.filter((y) => y !== e.id) } : x)))}
                      />
                    </View>
                  </View>
                );
              })}
              <View style={styles.addInBlock}>
                <Button label={plain ? 'Add an exercise' : 'Add an exercise here'} icon="plus" kind="quiet" full={false} onPress={() => setExerciseFor(b.id)} />
              </View>
            </View>
          );
        })
      )}

      <View style={[styles.body, { gap: space[2] }]}>
        <Button label="Add to this session" icon="plus" kind="secondary" onPress={() => setPicker(true)} accessibilityHint="Paste a workout, pick a template, or add exercises, an AMRAP, intervals and more" />
        {!isOverride && program.weeks.length > 1 ? <Button label="Copy this day to another week" icon="copy" kind="quiet" onPress={() => setCopying(true)} /> : null}
        {!isOverride ? (
          <Button
            label="Delete this day"
            icon="trash-2"
            kind="quiet"
            onPress={() =>
              confirm('Delete this day?', `${day.title || 'This session'} and everything in it will be removed from week ${weekIndex + 1}.`, 'Delete', () => {
                change(id, { ...program, weeks: program.weeks.map((w, i) => (i === weekIndex ? { ...w, days: w.days.filter((d) => d.id !== day.id) } : w)) });
                router.back();
              })
            }
          />
        ) : null}
      </View>

      <BlockPicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(c) => {
          if (c.type === 'kind') return addKind(c.kind);
          setPicker(false);
          router.push(`/${c.type === 'paste' ? 'paste' : 'templates'}?program=${encodeURIComponent(id)}&day=${day.id}`);
        }}
      />

      <ExercisePicker
        visible={exerciseFor != null}
        title="Add an exercise"
        library={library}
        onClose={() => setExerciseFor(null)}
        onPick={(ex) => {
          const pe = newExercise(ex);
          const target = exerciseFor;
          setDay((d) => {
            if (target !== 'new') return addExerciseToDay(d, pe, target);
            // "Exercises with sets" from the picker: a new strength part at the end (unless the last part is strength).
            const bs = dayBlocks(d);
            const last = bs[bs.length - 1];
            if (last?.kind === 'strength') return addExerciseToDay(d, pe, last.id);
            const s = newWorkoutBlock('strength');
            return addExerciseToDay(setDayBlocks(d, [...bs, s]), pe, s.id);
          });
          setExerciseFor(null);
          router.push(`/program/${encodeURIComponent(id)}/exercise/${pe.id}`);
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

const blockTitle = (b: Block) => (b.title ? b.title : b.kind.replace(/_/g, ' '));

/** Strategy & Stimulus: a draft until the coach approves it; clients only see approved text. */
function BriefCard({ brief, onChange }: { brief: DayBriefState; onChange: (b: DayBriefState | null) => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState({ stimulus: brief.stimulus, strategy: brief.strategy });
  const draft = brief.status === 'draft';
  return (
    <View>
      <SectionLabel right={<Tag label={draft ? 'Draft · clients don’t see it' : 'Approved · clients see it'} tone={draft ? 'warning' : 'success'} />}>Strategy & stimulus</SectionLabel>
      <View style={[styles.brief, { borderLeftColor: draft ? colors.warning : colors.brand }]}>
        {editing ? (
          <>
            <TextField label="What it should feel like" value={text.stimulus} onChangeText={(stimulus) => setText((t) => ({ ...t, stimulus }))} multiline maxLength={400} />
            <TextField label="How to pace it" value={text.strategy} onChangeText={(strategy) => setText((t) => ({ ...t, strategy }))} multiline maxLength={600} />
          </>
        ) : (
          <>
            <Text variant="caption" color="ink2">
              What it should feel like
            </Text>
            <Text variant="callout">{brief.stimulus}</Text>
            <Text variant="caption" color="ink2" style={{ marginTop: space[2] }}>
              How to pace it
            </Text>
            <Text variant="callout">{brief.strategy}</Text>
            {brief.source === 'ai' ? (
              <Text variant="caption" color="ink2" style={{ marginTop: space[2] }}>
                Drafted by AI from this session’s parts only. Check it before you approve.
              </Text>
            ) : null}
          </>
        )}
      </View>
      <View style={[styles.body, styles.briefActions]}>
        {editing ? (
          <>
            <View style={{ flex: 1 }}>
              <Button
                label="Save and approve"
                kind="secondary"
                disabled={!text.stimulus.trim() || !text.strategy.trim()}
                disabledReason="Write both parts"
                onPress={() => {
                  onChange({ ...text, status: 'approved', source: 'coach', updatedAt: new Date().toISOString() });
                  setEditing(false);
                  toast({ message: 'Approved. Clients see it from their next session.' });
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" kind="quiet" onPress={() => setEditing(false)} />
            </View>
          </>
        ) : (
          <>
            {draft ? (
              <View style={{ flex: 1 }}>
                <Button
                  label="Approve"
                  kind="secondary"
                  onPress={() => {
                    onChange({ ...brief, status: 'approved', updatedAt: new Date().toISOString() });
                    toast({ message: 'Approved. Clients see it from their next session.' });
                  }}
                />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button label="Edit" kind="quiet" onPress={() => setEditing(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Remove"
                kind="quiet"
                onPress={() => {
                  onChange(null);
                  toast({ message: 'Removed.', actionLabel: 'Undo', onAction: () => onChange(brief) });
                }}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[4] },
  body: { paddingHorizontal: margin, paddingTop: space[4] },
  exRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  exActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space[2], marginTop: -space[3] },
  blockActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space[2] },
  blockCard: { borderBottomWidth: StyleSheet.hairlineWidth },
  strengthHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: margin, paddingTop: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  addInBlock: { paddingHorizontal: margin - space[2], paddingTop: space[1] },
  brief: { marginHorizontal: margin, borderLeftWidth: 3, paddingLeft: space[3], gap: 2 },
  briefActions: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
});
