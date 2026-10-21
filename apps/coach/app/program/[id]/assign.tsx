import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { addDays, mondayOf, programSummary } from '@spotter/core';
import { isoDay } from '@spotter/core/demo';
import { Button, EmptyState, IconButton, Monogram, Screen, SectionLabel, SegmentedControl, Text, useTheme, useToast, margin, space } from '@spotter/ui';
import { initials, useCoach } from '../../../src/store';
import { activeAssignmentFor, usePrograms } from '../../../src/programs';
import { longDate } from '../../../src/format';

type Start = 'today' | 'monday' | 'monday2';

/** Assign a published program to one client or many, with a start date (K-4). `?client=` preselects one. */
export default function AssignProgram() {
  const { id, client } = useLocalSearchParams<{ id: string; client?: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const clients = useCoach((s) => s.clients);
  const { programs, assignments, assignTo } = usePrograms();
  const program = programs.find((p) => p.id === id);
  const [picked, setPicked] = useState<string[]>(client ? [client] : []);
  const [start, setStart] = useState<Start>('monday');

  const today = isoDay(0);
  const nextMonday = addDays(mondayOf(today), 7);
  const startDate = start === 'today' ? today : start === 'monday' ? nextMonday : addDays(nextMonday, 7);
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/program/${id}`));

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

  const draft = program.status !== 'published';
  const replacing = picked.filter((c) => activeAssignmentFor(assignments, c)?.programId && activeAssignmentFor(assignments, c)?.programId !== program.id).length;
  const toggle = (c: string) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const missing = draft ? 'Publish the program first.' : picked.length === 0 ? 'Pick at least one client.' : undefined;

  const confirm = () => {
    assignTo(program.id, picked, startDate);
    toast({ message: `Assigned to ${picked.length === 1 ? clients.find((c) => c.id === picked[0])?.name ?? '1 client' : `${picked.length} clients`}. Starts ${longDate(startDate)}.` });
    back();
  };

  return (
    <Screen
      footer={
        <Button
          label={picked.length > 1 ? `Assign to ${picked.length} clients` : 'Assign'}
          onPress={confirm}
          disabled={!!missing}
          disabledReason={missing}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          Assign
        </Text>
        <Text variant="title" accessibilityRole="header">
          {program.name}
        </Text>
        <Text color="ink2">{programSummary(program)}</Text>
      </View>

      <SectionLabel>Starts</SectionLabel>
      <View style={styles.block}>
        <SegmentedControl<Start>
          label="Start date"
          value={start}
          onChange={setStart}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'monday', label: 'Next Monday' },
            { value: 'monday2', label: 'In 2 weeks' },
          ]}
        />
        <Text variant="callout" color="ink2">
          Week 1 begins {longDate(startDate)}.{replacing ? ` Replaces the current program for ${replacing === 1 ? '1 client' : `${replacing} clients`}; their history stays.` : ''}
        </Text>
      </View>

      <SectionLabel right={<Text variant="caption" color="ink2">{`${picked.length} picked`}</Text>}>Clients</SectionLabel>
      {clients.map((c) => {
        const on = picked.includes(c.id);
        const current = activeAssignmentFor(assignments, c.id);
        const currentName = current ? programs.find((p) => p.id === current.programId)?.name : null;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${c.name}${currentName ? `, currently on ${currentName}` : ', no program'}`}
            onPress={() => toggle(c.id)}
            style={[styles.row, { borderBottomColor: colors.line, backgroundColor: on ? colors.surface : 'transparent' }]}
          >
            <View style={[styles.box, { borderColor: on ? colors.ink : colors.ink2, backgroundColor: on ? colors.ink : 'transparent' }]}>
              {on ? <Feather name="check" size={14} color={colors.paper} /> : null}
            </View>
            <Monogram initials={initials(c.name)} size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{c.name}</Text>
              <Text variant="callout" color="ink2">
                {c.status === 'paused' ? 'Paused · ' : ''}
                {currentName ? (current?.programId === program.id ? 'Already on this program' : `On ${currentName}`) : 'No program yet'}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  block: { paddingHorizontal: margin, paddingTop: space[3], gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, minHeight: 64, paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
