import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { dayBlocks, dayFor, describeBlock } from '@spotter/core';
import { tenant } from './env';
import { isoDay } from '@spotter/core/demo';
import { Button, ListRow, SectionLabel, Tag, Text, margin, space } from '@spotter/ui';
import { activeAssignmentFor, usePrograms } from './programs';
import { describeInUnit, longDate } from './format';

/** Client detail (K-3): current program, today's session, and the assign/adjust/edit-today actions. */
export function ProgramSection({ clientId }: { clientId: string }) {
  const { assignments, programs, editSession } = usePrograms();
  const a = activeAssignmentFor(assignments, clientId);
  const today = isoDay(0);
  const program = a ? programs.find((p) => p.id === a.programId) : null;

  if (!a || !program) {
    return (
      <>
        <SectionLabel>Program</SectionLabel>
        <View style={styles.body}>
          <Text color="ink2">No program yet. Their Today screen says you’re building one.</Text>
          <Button label="Assign a program" icon="clipboard" kind="secondary" onPress={() => router.push(`/client/${clientId}/program`)} />
        </View>
      </>
    );
  }

  const d = dayFor(a, today);
  const totalWeeks = program.weeks.length;
  const status =
    totalWeeks === 0
      ? 'Single sessions, sent one date at a time'
      : d.kind === 'session' || d.kind === 'rest'
      ? `Week ${d.weekIndex + 1} of ${totalWeeks}`
      : d.kind === 'not_started'
        ? `Starts ${longDate(a.startDate)}`
        : d.kind === 'paused'
          ? 'Paused'
          : 'Finished';

  const editToday = () => {
    const key = editSession(a.id, today);
    if (!key) return;
    const draft = usePrograms.getState().drafts[key];
    const dayId = draft?.program.weeks[0]?.days[0]?.id;
    if (dayId) router.push(`/program/${encodeURIComponent(key)}/day/${dayId}`);
  };

  return (
    <>
      <SectionLabel>Program</SectionLabel>
      <ListRow
        title={program.name}
        subtitle={`${status} · started ${longDate(a.startDate)}`}
        right={program.version > 1 ? <Tag label={`v${program.version}`} /> : undefined}
        chevron
        onPress={() => router.push(`/program/${program.id}`)}
      />
      <ListRow
        title={d.kind === 'session' ? `Today: ${d.day.title}` : d.kind === 'rest' ? 'Today: rest day' : 'Today: nothing scheduled'}
        subtitle={
          d.kind === 'session'
            ? `${d.overridden ? 'Edited for today · ' : ''}${dayBlocks(d.day)
                .flatMap((b) =>
                  b.kind === 'strength'
                    ? b.exerciseIds.map((x) => d.day.exercises.find((e) => e.id === x)).filter((e) => !!e).map((e) => `${e!.name} ${describeInUnit(e!)}`)
                    : b.kind === 'note'
                      ? []
                      : [describeBlock(b, tenant.units)],
                )
                .join(' · ')}`
            : undefined
        }
        last
      />
      <View style={[styles.body, styles.row]}>
        <View style={{ flex: 1 }}>
          <Button label="Change program" kind="secondary" onPress={() => router.push(`/client/${clientId}/program`)} />
        </View>
        {d.kind === 'session' || d.kind === 'rest' ? (
          <View style={{ flex: 1 }}>
            <Button label={d.kind === 'rest' ? 'Add a session today' : 'Edit today’s session'} kind="secondary" onPress={editToday} />
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[3] },
  row: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
});
