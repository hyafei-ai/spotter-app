import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { WEEKDAY_LONG, copyWeek, move, newDay, programProblems, programSummary, uuidv7, type Program } from '@spotter/core';
import { Banner, Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, Sheet, Tag, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { assignedCount, useEditing, usePrograms } from '../../../src/programs';
import { WeekdayPicker } from '../../../src/programUi';
import { confirm } from '../../../src/confirm';

/** K-4 program editor: name, weeks and days. Days open the day editor. */
export default function ProgramEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { program, draft } = useEditing(id);
  const { change, save, discard, duplicate, remove, assignments } = usePrograms();
  const [addDayTo, setAddDayTo] = useState<number | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const back = () => {
    const go = () => (router.canGoBack() ? router.back() : router.replace('/programs'));
    if (!draft?.dirty) return go();
    confirm('Discard changes?', 'Your edits to this program haven’t been saved.', 'Discard', () => {
      discard(id);
      go();
    });
  };

  if (!program) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={() => router.replace('/programs')} />
        </View>
        <EmptyState message="This program was deleted." actionLabel="Back to programs" onAction={() => router.replace('/programs')} />
      </Screen>
    );
  }

  const set = (p: Program) => change(id, p);
  const n = assignedCount(assignments, program.id);
  const isDraft = program.status === 'draft';
  const dirty = !!draft?.dirty;

  const onSave = (publishIt: boolean) => {
    const res = save(id, { publish: publishIt });
    if (!res.ok) {
      setProblems(res.problems);
      return;
    }
    setProblems([]);
    toast({
      message: publishIt
        ? 'Published. You can assign it now.'
        : n
          ? `Saved. ${n === 1 ? 'Your client gets' : `${n} clients get`} the changes from their next session.`
          : 'Saved.',
    });
  };

  const footer = isDraft ? (
    <View style={styles.footerRow}>
      <View style={{ flex: 1 }}>
        <Button label="Save draft" kind="secondary" onPress={() => onSave(false)} disabled={!dirty} disabledReason={!dirty ? 'No changes yet' : undefined} />
      </View>
      <View style={{ flex: 1.2 }}>
        <Button label="Publish" onPress={() => onSave(true)} />
      </View>
    </View>
  ) : dirty ? (
    <Button label="Save changes" onPress={() => onSave(false)} />
  ) : (
    <Button label={n ? 'Assign to more clients' : 'Assign to clients'} icon="user-plus" onPress={() => router.push(`/program/${program.id}/assign`)} />
  );

  return (
    <Screen
      footer={footer}
      banner={
        program.source === 'ai_draft' && isDraft ? (
          <Banner tone="warning" message="AI draft. Check every exercise and load before you publish. Clients see nothing until you do." />
        ) : dirty && n ? (
          <Banner message={`Unsaved. Saved changes reach ${n === 1 ? 'your client' : `${n} clients`} from their next session, not ones already done.`} />
        ) : undefined
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back to programs" onPress={back} />
        <View style={{ flex: 1 }} />
        <IconButton
          icon="copy"
          label="Duplicate program"
          onPress={() => {
            const copy = duplicate(program.id);
            toast({ message: 'Copied as a new draft.' });
            router.replace(`/program/${copy}`);
          }}
        />
        <IconButton
          icon="trash-2"
          label="Delete program"
          onPress={() => {
            if (n) {
              toast({ message: `Assigned to ${n === 1 ? 'a client' : `${n} clients`}. Change their program first.` });
              return;
            }
            confirm('Delete this program?', 'This can’t be undone.', 'Delete', () => {
              remove(program.id);
              router.replace('/programs');
            });
          }}
        />
      </View>

      <View style={styles.head}>
        <View style={styles.tags}>
          {isDraft ? <Tag label={program.source === 'ai_draft' ? 'AI draft' : 'Draft'} tone={program.source === 'ai_draft' ? 'brand' : 'neutral'} /> : <Tag label={`Live · v${program.version}`} tone="success" />}
          {program.isTemplate ? <Tag label="Template" /> : null}
          {n ? <Tag label={`Assigned to ${n}`} /> : null}
        </View>
        <TextField label="Program name" value={program.name} onChangeText={(name) => set({ ...program, name })} placeholder="e.g. Strength Base" />
        <Text variant="callout" color="ink2">
          {programSummary(program)}
        </Text>
      </View>

      {problems.length ? (
        <View accessibilityRole="alert" style={[styles.problems, { borderLeftColor: colors.error, backgroundColor: colors.surface }]}>
          <Text variant="bodyStrong">Fix these first</Text>
          {problems.slice(0, 6).map((p) => (
            <Text key={p} variant="callout">
              {p}
            </Text>
          ))}
          {problems.length > 6 ? <Text variant="callout" color="ink2">{`and ${problems.length - 6} more`}</Text> : null}
        </View>
      ) : null}

      {program.weeks.map((w, wi) => {
        const weekProblems = programProblems(program).filter((p) => p.where.weekIndex === wi && p.where.dayId);
        return (
          <View key={w.id}>
            <SectionLabel
              right={
                <View style={styles.weekActions}>
                  <IconButton icon="arrow-up" label={`Move week ${wi + 1} earlier`} onPress={() => wi > 0 && set({ ...program, weeks: move(program.weeks, wi, -1) })} />
                  <IconButton icon="copy" label={`Copy week ${wi + 1} to the end`} onPress={() => set(copyWeek(program, w.id))} />
                  <IconButton
                    icon="x"
                    label={`Delete week ${wi + 1}`}
                    onPress={() =>
                      confirm(`Delete week ${wi + 1}?`, `Its ${w.days.length} day${w.days.length === 1 ? '' : 's'} will be removed.`, 'Delete', () =>
                        set({ ...program, weeks: program.weeks.filter((x) => x.id !== w.id) }),
                      )
                    }
                  />
                </View>
              }
            >{`Week ${wi + 1}`}</SectionLabel>
            {w.days.length === 0 ? (
              <Text color="ink2" style={styles.body}>
                No sessions this week yet.
              </Text>
            ) : (
              w.days.map((d) => {
                const problem = weekProblems.find((p) => p.where.dayId === d.id);
                return (
                  <ListRow
                    key={d.id}
                    title={`${WEEKDAY_LONG[d.weekday - 1]} · ${d.title || 'Untitled'}`}
                    subtitle={d.exercises.length ? d.exercises.map((e) => e.name).join(', ') : 'No exercises yet'}
                    reason={problem ? 'Needs attention' : undefined}
                    chevron
                    onPress={() => router.push(`/program/${id}/day/${d.id}`)}
                  />
                );
              })
            )}
            {w.days.length < 7 ? (
              <View style={styles.addDay}>
                <Button label="Add a day" icon="plus" kind="quiet" full={false} onPress={() => setAddDayTo(wi)} />
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={[styles.body, { gap: space[2] }]}>
        <Button
          label="Add an empty week"
          kind="secondary"
          icon="plus"
          onPress={() => set({ ...program, weeks: [...program.weeks, { id: uuidv7(), days: [] }] })}
        />
        {program.weeks.length ? (
          <Button label={`Copy week ${program.weeks.length} to a new week`} kind="quiet" icon="copy" onPress={() => set(copyWeek(program, program.weeks[program.weeks.length - 1]!.id))} />
        ) : null}
      </View>

      <Sheet visible={addDayTo != null} title={addDayTo != null ? `Add a day to week ${addDayTo + 1}` : ''} onClose={() => setAddDayTo(null)}>
        {addDayTo != null ? (
          <View style={{ paddingHorizontal: margin, gap: space[3] }}>
            <Text color="ink2">Pick the day of the week. The client sees this session on that day.</Text>
            <WeekdayPicker
              value={null}
              taken={program.weeks[addDayTo]!.days.map((d) => d.weekday)}
              onChange={(weekday) => {
                const day = newDay(weekday, `Day ${program.weeks[addDayTo]!.days.length + 1}`);
                const weeks = program.weeks.map((w, i) => (i === addDayTo ? { ...w, days: [...w.days, day].sort((a, b) => a.weekday - b.weekday) } : w));
                set({ ...program, weeks });
                setAddDayTo(null);
                router.push(`/program/${id}/day/${day.id}`);
              }}
            />
            <View style={styles.legend}>
              <Feather name="info" size={14} color={colors.ink2} />
              <Text variant="caption" color="ink2">
                Faded days already have a session this week.
              </Text>
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[3] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
  weekActions: { flexDirection: 'row', marginVertical: -space[3] },
  addDay: { paddingHorizontal: margin - space[2], paddingTop: space[1] },
  footerRow: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  problems: { marginHorizontal: margin, marginTop: space[4], padding: space[3], borderLeftWidth: 3, borderRadius: 6, gap: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
});
