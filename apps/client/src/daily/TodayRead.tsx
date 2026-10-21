import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { describeLighter, type ReadTone, type SessionPlan } from '@spotter/core';
import { Button, Tag, Text, useTheme, margin, radius, space } from '@spotter/ui';
import { tenant } from '../env';
import { localDate } from '../nutrition/store';
import { useApp } from '../store';
import { useDaily } from './store';
import { useLighterRule, useTodayRead } from './read';
import { lighterPlan, recoveryPlan } from './options';

/** Words carry the meaning; the tag colour only repeats them. */
export const TONE_LABEL: Record<ReadTone, string> = { steady: 'Steady', watch: 'Keep an eye on it', ease: 'Easier day' };
export const TONE_TAG: Record<ReadTone, 'success' | 'warning' | 'brand'> = { steady: 'success', watch: 'warning', ease: 'brand' };

/**
 * Today's daily check (client JTBD: train around body variance; share the read without extra effort).
 * Above the coach note: the prompt while today's check isn't done, then the read. With `plan`, also the
 * coach's easier and recovery versions when the read suggests it. The client always chooses.
 */
export function TodayRead({ plan }: { plan?: SessionPlan }) {
  const { colors } = useTheme();
  const hydrated = useDaily((s) => s.hydrated);
  const skippedOn = useDaily((s) => s.skippedOn);
  const skipToday = useDaily((s) => s.skipToday);
  const { check, read } = useTodayRead();
  const first = tenant.coach.name.split(' ')[0] ?? '';
  if (!hydrated) return null;

  const showPrompt = !check && skippedOn !== localDate();
  const hasRead = !!check || read.factors.length > 0;

  return (
    <View>
      {showPrompt ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text variant="bodyStrong">How are you today?</Text>
          <Text variant="callout" color="ink2">
            Sleep, energy, soreness. About 30 seconds. Skip it any day.
          </Text>
          <View style={styles.row}>
            <Button label="Check in" full={false} onPress={() => router.push('/check-today')} accessibilityHint="Opens today’s check" />
            <Button label="Skip today" kind="quiet" full={false} onPress={skipToday} />
          </View>
        </View>
      ) : null}
      {hasRead ? (
        <View style={[styles.read, { borderLeftColor: colors.line }]} accessibilityLabel={`Today’s read: ${TONE_LABEL[read.tone]}. ${read.headline}`}>
          <View style={styles.row}>
            <Text variant="label" color="ink2">
              Today’s read
            </Text>
            <Tag label={TONE_LABEL[read.tone]} tone={TONE_TAG[read.tone]} />
          </View>
          <Text variant="callout">{read.headline}</Text>
          {read.factors.filter((f) => !read.headline.toLowerCase().includes(f.text.toLowerCase())).map((f) => (
            <Text key={f.kind} variant="caption" color="ink2">
              {'· '}
              {f.text}
            </Text>
          ))}
          <Text variant="caption" color="ink2">
            {!check
              ? 'From the last few nights. Check in to add today.'
              : check.shareWithCoach
                ? `Shared with ${first}${check.cyclePhase && !check.shareCycle ? ' (cycle phase kept private)' : ''}.`
                : `Kept private. ${first} won’t see today’s read.`}
          </Text>
          {plan && read.suggestLighter ? <Options plan={plan} first={first} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function Options({ plan, first }: { plan: SessionPlan; first: string }) {
  const rule = useLighterRule();
  const completed = useApp((s) => s.completed);
  const startSession = useApp((s) => s.startSession);
  const recordVariant = useDaily((s) => s.recordVariant);
  const recovery = recoveryPlan(plan.scheduledDate, completed);

  const go = async (p: SessionPlan, variant: 'lighter' | 'recovery') => {
    const id = await startSession(p, variant);
    void recordVariant(id, p.scheduledDate, plan.title, variant);
    router.push(`/session/${id}`);
  };

  return (
    <View style={{ gap: space[2], marginTop: space[2] }}>
      <Text variant="caption" color="ink2">
        Your call. The planned session is still below.
      </Text>
      <Button
        label={`Easier version: ${describeLighter(rule)}`}
        kind="secondary"
        onPress={() => void go(lighterPlan(plan, rule), 'lighter')}
        accessibilityHint={`Starts ${plan.title} with ${first}’s easier settings`}
      />
      {recovery ? (
        <Button label={`Do ${first}’s recovery session instead`} kind="secondary" onPress={() => void go(recovery, 'recovery')} accessibilityHint={`Starts ${recovery.title}`} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: margin, marginTop: space[3], padding: space[4], borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.sheet, gap: space[2] },
  read: { marginHorizontal: margin, marginTop: space[3], borderLeftWidth: 3, paddingLeft: space[3], gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
});
