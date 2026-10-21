import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import type { DraftProgram, ProgramExercise } from '@spotter/core';
import {
  Banner,
  Button,
  EmptyState,
  IconButton,
  ListRow,
  Screen,
  SectionLabel,
  SegmentedControl,
  Skeleton,
  Tag,
  Text,
  useTheme,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { useCoach } from '../../../src/store';
import { AI_LIVE, useAi } from '../../../src/ai/store';
import { demoIntake } from '../../../src/ai/demoSource';

const IDLE = { status: 'idle' } as const;

/**
 * K-2 program draft: a 4–8 week block from the client's intake and the coach's own library.
 * It opens as an unpublished draft; the client sees nothing until the coach publishes and assigns it.
 */
export default function AiProgram() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const net = useNetInfo();
  const client = useCoach((s) => s.clients.find((c) => c.id === id));
  const stored = useAi((s) => s.programs[id ?? '']);
  const state = stored ?? IDLE;
  const { draftProgram, saveProgramDraft } = useAi();
  const [weeks, setWeeks] = useState('6');
  const offline = net.isConnected === false;
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/client/${id}`));

  if (!client || !id) {
    return (
      <Screen>
        <EmptyState message="This client isn’t in your list any more." actionLabel="Back to clients" onAction={() => router.replace('/clients')} />
      </Screen>
    );
  }
  const first = client.name.split(' ')[0];
  // Live builds read the intake server-side; the demo shows the MOCK intake it uses.
  const intake = AI_LIVE ? null : demoIntake(id);

  const footer =
    state.status === 'ready' ? (
      state.saved ? (
        <Button label="Back to client" kind="secondary" onPress={back} />
      ) : (
        <>
          <Button
            label="Save as unpublished draft"
            onPress={() => {
              saveProgramDraft(id);
              toast({ message: 'Saved as an unpublished draft. Review it before you assign it.' });
            }}
          />
          <Button label="Draft again" kind="quiet" icon="refresh-cw" onPress={() => void draftProgram(id, Number(weeks))} disabled={offline} />
        </>
      )
    ) : state.status === 'idle' || state.status === 'failed' ? (
      <Button
        label={state.status === 'failed' ? 'Try again' : 'Draft program'}
        icon={state.status === 'failed' ? 'refresh-cw' : undefined}
        onPress={() => void draftProgram(id, Number(weeks))}
        disabled={offline || (!AI_LIVE && !intake)}
        disabledReason={offline ? 'You’re offline. Drafting needs a connection.' : `${first} hasn’t finished their intake yet.`}
      />
    ) : undefined;

  return (
    <Screen banner={offline ? <Banner tone="warning" message="You’re offline. Drafting needs a connection." /> : undefined} footer={footer}>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            Draft a program
          </Text>
          <Tag label="Draft" tone="brand" />
        </View>
        <Text color="ink2">For {client.name}. Built from their intake and your exercise library. You edit, publish and assign it.</Text>
      </View>

      {state.status === 'idle' || state.status === 'failed' || state.status === 'generating' ? (
        <>
          <SectionLabel>From the intake</SectionLabel>
          {AI_LIVE ? (
            <ListRow title="Goal, days per week, equipment and injuries" subtitle="Read from the intake when you draft. Health answers and contact details aren’t sent." last />
          ) : intake ? (
            <>
              <ListRow title="Goal" subtitle={intake.goal} />
              <ListRow title="Days per week" subtitle={intake.days} />
              <ListRow title="Equipment" subtitle={intake.equipment} />
              <ListRow title="Injuries" subtitle={intake.injuries ?? 'None noted'} last />
            </>
          ) : (
            <EmptyState message={`${first} hasn’t finished their intake yet. Drafts need their goal, days and equipment.`} />
          )}
          <View style={styles.body}>
            <Text variant="label" color="ink2">
              Length
            </Text>
            <View style={{ marginTop: space[2] }}>
              <SegmentedControl
                label="Program length in weeks"
                value={weeks}
                onChange={setWeeks}
                options={['4', '5', '6', '7', '8'].map((v) => ({ value: v, label: `${v} wk` }))}
              />
            </View>
          </View>
        </>
      ) : null}

      {state.status === 'generating' ? (
        <View style={styles.body} accessibilityLiveRegion="polite">
          <Text color="ink2">Drafting a {weeks}-week block…</Text>
          <View style={{ gap: space[2], marginTop: space[3] }}>
            {[70, 90, 80].map((w) => (
              <Skeleton key={w} width={`${w}%`} height={18} />
            ))}
          </View>
        </View>
      ) : null}

      {state.status === 'failed' ? (
        <View style={styles.body}>
          <View accessibilityRole="alert" style={[styles.notice, { borderLeftColor: colors.error, backgroundColor: colors.surface }]}>
            <Text variant="bodyStrong">The draft didn’t come through</Text>
            <Text variant="callout" color="ink2">
              {state.message}
            </Text>
          </View>
        </View>
      ) : null}

      {state.status === 'cap' ? <EmptyState message={state.message} actionLabel="Back to client" onAction={back} /> : null}
      {state.status === 'no_intake' ? (
        <EmptyState message={`${first} hasn’t finished their intake yet. Drafts need their goal, days and equipment.`} actionLabel={`Message ${first}`} onAction={() => router.push(`/client/${id}/thread`)} />
      ) : null}

      {state.status === 'ready' ? <DraftPreview program={state.program} saved={state.saved} /> : null}
    </Screen>
  );
}

function DraftPreview({ program, saved }: { program: DraftProgram; saved: boolean }) {
  const [open, setOpen] = useState<number>(0);
  const { colors } = useTheme();
  return (
    <View>
      <View style={styles.body}>
        <View style={[styles.notice, { borderLeftColor: colors.brand, backgroundColor: colors.surface }]}>
          <Text variant="bodyStrong">{program.name}</Text>
          <Text variant="callout" color="ink2">
            {saved ? 'Saved as an unpublished draft.' : 'Not saved yet.'} Loads are left for you to set. Clients can’t see it until you publish and assign it.
          </Text>
        </View>
      </View>
      {program.weeks.map((w) => {
        const expanded = open === w.weekIndex;
        return (
          <View key={w.weekIndex}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`Week ${w.weekIndex + 1}, ${w.days.length} days`}
              onPress={() => setOpen(expanded ? -1 : w.weekIndex)}
              style={[styles.weekRow, { borderBottomColor: colors.line }]}
            >
              <Text variant="headline" style={{ flex: 1 }}>
                Week {w.weekIndex + 1}
              </Text>
              <Text variant="callout" color="ink2">
                {w.days.length} days
              </Text>
              <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink2} />
            </Pressable>
            {expanded
              ? w.days.map((d, di) => (
                  <View key={di} style={styles.day}>
                    <Text variant="bodyStrong">{d.title}</Text>
                    {d.coachNote ? (
                      <Text variant="callout" color="ink2">
                        {d.coachNote}
                      </Text>
                    ) : null}
                    {d.exercises.map((e) => (
                      <Text key={e.id} variant="callout">
                        {e.name} · {dose(e)}
                      </Text>
                    ))}
                  </View>
                ))
              : null}
          </View>
        );
      })}
    </View>
  );
}

function dose(e: ProgramExercise): string {
  const s = e.sets[0];
  if (!s) return '';
  const n = e.sets.length;
  if (e.metric === 'time') return `${n} × ${s.durationS ?? 0} s`;
  if (e.metric === 'distance') return `${n} × ${s.distanceM ?? 0} m`;
  const reps = s.repsMin != null && s.repsMax != null && s.repsMin !== s.repsMax ? `${s.repsMin}–${s.repsMax}` : `${s.repsMax ?? s.repsMin ?? ''}`;
  return `${n} × ${reps}${s.rpe != null ? ` @ RPE ${s.rpe}` : ''}`;
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[5] },
  notice: { padding: space[3], borderLeftWidth: 3, borderRadius: 6, gap: 2 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: margin, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  day: { paddingHorizontal: margin, paddingVertical: space[3], gap: 2 },
});
