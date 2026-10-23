import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  BODY_REGION_LABEL,
  CONFIDENCE_WORDS,
  CYCLE_PHASE_LABEL,
  calibrationLine,
  cycleRingSegments,
  mobilityFromImported,
  ongoingPain,
  painText,
  weekMinutes,
} from '@spotter/core';
import { Button, ListRow, MiniBars, MiniMeter, MiniRing, MiniSpark, Screen, ScreenHeader, Text, useTheme, fonts, space } from '@spotter/ui';
import { isOn } from '../../src/modules';
import { localDate } from '../../src/nutrition/store';
import { BodyCard } from '../../src/body/Card';
import { hours, useRecovery } from '../../src/body/useRecovery';
import { useCycleToday } from '../../src/cycle/hooks';
import { useFuelCheck, type FuelView } from '../../src/fuel/useFuelCheck';
import { useInjury } from '../../src/injury/store';
import { FUEL_PLAIN } from '../../src/fuel/plain';
import { useMobility } from '../../src/mobility/store';
import { useHealthImports } from '../../src/health/store';

/**
 * Body (docs/ux/client-experience.md): how the body is responding, one card per area, each a small honest
 * chart and one plain line, each opening its detail. Compared with the person's own usual, never others.
 */
export default function Body() {
  const { colors } = useTheme();
  const { profile } = useCycleToday();
  const tracking = profile.mode !== 'not_tracking';
  return (
    <Screen>
      <ScreenHeader
        title="Body"
        subtitle="How you’re responding, against your own usual"
        right={
          <Pressable onPress={() => router.push('/sharing')} accessibilityRole="link" accessibilityLabel="Who sees what" hitSlop={8} style={styles.headLink}>
            <Feather name="eye" size={16} color={colors.brand} />
            <Text variant="callout" style={{ color: colors.brand, fontFamily: fonts.semibold }}>
              Who sees what
            </Text>
          </Pressable>
        }
      />
      <RecoveryCard />
      {tracking ? <CycleCard /> : null}
      {isOn('nutrition') ? <FuelCard /> : null}
      <PainCard />
      <MobilityCard />
      {!tracking ? (
        <View style={{ marginTop: space[4] }}>
          <ListRow title="Track your cycle" subtitle="Optional and private. Fits training to your own data." chevron last onPress={() => router.push('/cycle')} />
        </View>
      ) : null}
    </Screen>
  );
}

function RecoveryCard() {
  const r = useRecovery();
  if (r.empty) {
    return (
      <BodyCard title="Recovery" line="Connect Apple Health to see sleep and recovery" onPress={() => router.push('/me')} hint="Opens Me, where you connect your health app">
        <Text variant="callout" color="ink2">
          Sleep, heart rate variability and resting heart rate from your watch, compared with your own usual.
        </Text>
      </BodyCard>
    );
  }
  const nights = r.sleep.nights;
  return (
    <BodyCard
      title="Recovery"
      line={r.headline}
      onPress={() => router.push('/recovery')}
      hint="Opens sleep, HRV and resting heart rate"
      caption={`${r.source ? `From ${r.source}` : ''}${r.origin === 'mock' ? ' · sample data' : ''}`}
    >
      <View style={{ gap: space[1] }}>
        <Text variant="callout">{r.sleep.line}</Text>
        <MiniBars
          values={nights}
          reference={r.sleep.usual}
          max={10}
          emphasis={(i) => i === nights.length - 1}
          label={`Sleep, last 14 nights, oldest first: ${nights.map((n) => hours(n)).join(', ')}.${r.sleep.usual != null ? ` Your usual: ${hours(r.sleep.usual)}.` : ''}`}
        />
        <Text variant="caption" color="ink2">{`Sleep, last 14 nights${r.sleep.usual != null ? ` · dashed line: your usual ${hours(r.sleep.usual)}` : ''}`}</Text>
      </View>
      <View style={styles.split}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="bodyStrong">HRV</Text>
          <MiniSpark values={r.hrv.values} band={r.hrv.band} height={40} label={`HRV, last 14 days. ${r.hrv.plain}`} />
          <Text variant="caption" color="ink2">
            {r.hrv.status.status === 'low' ? 'Under your usual' : r.hrv.status.status === 'normal' ? 'In your usual range' : 'Learning your usual'}
          </Text>
        </View>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="bodyStrong">Resting HR</Text>
          <MiniSpark values={r.rhr.values} band={r.rhr.band} height={40} label={`Resting heart rate, last 14 days. ${r.rhr.plain}`} />
          <Text variant="caption" color="ink2">
            {r.rhr.status.status === 'high' ? 'Higher than usual' : r.rhr.status.status === 'normal' ? 'Close to your usual' : 'Learning your usual'}
          </Text>
        </View>
      </View>
    </BodyCard>
  );
}

function CycleCard() {
  const { estimate, calibration } = useCycleToday();
  const { length, segments } = cycleRingSegments(estimate);
  const phase = estimate.phase;
  const line = phase ? (phase === 'menstrual' ? 'Period' : `${CYCLE_PHASE_LABEL[phase]} phase`) : 'No phase today';
  const cal = calibrationLine(calibration, phase);
  const runs = phase ? calibration.adjustments.find((a) => a.phase === phase) : null;
  const calText = cal ?? (runs && runs.sessions > 0 ? (Math.abs(runs.deltaPct) < 1 ? 'Your lifts run about your usual in this phase.' : `Your lifts run about ${Math.round(Math.abs(runs.deltaPct))}% ${runs.deltaPct < 0 ? 'lower' : 'higher'} in this phase. Not enough data to change loads yet.`) : estimate.note);
  return (
    <BodyCard title="Your cycle" line={line} onPress={() => router.push('/cycle')} hint="Opens your cycle" caption={`Phase estimate: ${CONFIDENCE_WORDS[estimate.confidence].toLowerCase()} · private unless you share it`}>
      <View style={styles.cycleRow}>
        {estimate.dayOfCycle != null ? (
          <MiniRing
            length={length}
            day={estimate.dayOfCycle}
            segments={segments.map((s) => ({ from: s.from, to: s.to, strong: s.phase === phase }))}
            label={`Cycle ring: day ${estimate.dayOfCycle} of about ${length}, ${line.toLowerCase()}.`}
            center={
              <View style={{ alignItems: 'center' }}>
                <Text variant="caption" color="ink2">
                  Day
                </Text>
                <Text variant="figure" tabular>
                  {String(estimate.dayOfCycle)}
                </Text>
              </View>
            }
          />
        ) : null}
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="callout">{calText}</Text>
          {estimate.nextPeriod ? (
            <Text variant="caption" color="ink2">
              {`Next period likely around ${new Date(`${estimate.nextPeriod.from}T12:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' })}`}
            </Text>
          ) : null}
        </View>
      </View>
    </BodyCard>
  );
}


/** This week: average food in vs average need (45 kcal per kg fat-free mass plus training), logged days only. */
function weekVsNeed(v: FuelView): { intake: number; need: number; days: number } | null {
  if (!v.ffm) return null;
  const week = v.days.filter((d) => d.date < v.today).slice(-7).filter((d) => d.intakeKcal != null);
  if (week.length < 3) return null;
  const intake = week.reduce((a, d) => a + d.intakeKcal!, 0) / week.length;
  const need = week.reduce((a, d) => a + 45 * v.ffm!.kg + (d.exerciseKcal ?? 0), 0) / week.length;
  return { intake: Math.round(intake / 10) * 10, need: Math.round(need / 10) * 10, days: week.length };
}

function FuelCard() {
  const view = useFuelCheck();
  const wk = weekVsNeed(view);
  const source = view.days.slice().reverse().find((d) => d.intake.label)?.intake.label;
  return (
    <BodyCard title="Fuel" line={FUEL_PLAIN[view.check.eaBand]} onPress={() => router.push('/nutrition/fuel')} hint="Opens the fuel check" caption={`${source ?? 'From your food logs'} · a screen, not a diagnosis`}>
      {wk ? (
        <View style={{ gap: space[1] }}>
          <MiniMeter value={wk.intake} max={Math.max(wk.need, wk.intake) * 1.15} ticks={[wk.need]} label={`This week, food averaged ${wk.intake} kcal a day against a need of about ${wk.need}.`} />
          <Text variant="caption" color="ink2">{`This week: about ${wk.intake.toLocaleString()} kcal a day eaten · line: about ${wk.need.toLocaleString()}, enough to cover training (${wk.days} days logged)`}</Text>
        </View>
      ) : view.check.note ? (
        <Text variant="callout" color="ink2">
          {view.check.note}
        </Text>
      ) : null}
    </BodyCard>
  );
}

function PainCard() {
  const logs = useInjury((s) => s.logs);
  const today = localDate();
  const ongoing = ongoingPain(logs, today);
  const days = Array.from({ length: 14 }, (_, k) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - (13 - k));
    const iso = localDate(d);
    const hits = logs.filter((l) => l.date === iso);
    return hits.length ? Math.max(...hits.map((l) => l.level)) : null;
  });
  const top = ongoing[0];
  // Plain words first ("Left knee pain, ongoing"); the counts are in the caption and on the Pain screen.
  const line = top
    ? `${top.side === 'left' ? 'Left ' : top.side === 'right' ? 'Right ' : ''}${top.side === 'left' || top.side === 'right' ? BODY_REGION_LABEL[top.region].toLowerCase() : BODY_REGION_LABEL[top.region]} pain, ongoing`
    : logs.length
      ? 'Nothing ongoing'
      : 'Nothing hurting';
  return (
    <BodyCard title="Pain" line={line} onPress={() => router.push('/pain')} hint="Opens pain, where you can log it" caption={top ? [painText(top), ...ongoing.slice(1).map((p) => painText(p))].join('. ') : days.some((d) => d != null) ? 'Pain logged in the last 14 days, 0 to 10' : undefined}>
      {days.some((d) => d != null) ? (
        <MiniBars values={days} max={10} height={40} emphasis={(_, v) => v >= 6} label={`Pain logged in the last 14 days, oldest first: ${days.map((d) => (d == null ? 'none' : `${d} of 10`)).join(', ')}.`} />
      ) : (
        <Button label="Log pain" kind="secondary" full={false} icon="plus" onPress={() => router.push('/pain')} />
      )}
    </BodyCard>
  );
}

function MobilityCard() {
  const logs = useMobility((s) => s.logs);
  const workouts = useHealthImports((s) => s.workouts);
  const imported = workouts.map(mobilityFromImported).filter((x): x is NonNullable<typeof x> => !!x);
  const week = weekMinutes([...logs, ...imported], localDate());
  return (
    <BodyCard
      title="Mobility"
      line={week.total ? `${week.total} min this week` : 'None this week yet'}
      onPress={() => router.push('/mobility')}
      hint="Opens mobility, where you can log a session"
      caption={week.sessions ? `${week.sessions} session${week.sessions === 1 ? '' : 's'} in the last 7 days, today on the right` : 'Stretching, yoga or your coach’s routine all count'}
    >
      {week.total ? <MiniBars values={week.days.map((m) => (m ? m : null))} height={40} emphasis={(i) => i === 6} label={`Mobility minutes, last 7 days, oldest first: ${week.days.join(', ')}.`} /> : null}
    </BodyCard>
  );
}

const styles = StyleSheet.create({
  headLink: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 44 },
  split: { flexDirection: 'row', gap: space[4], marginTop: space[2] },
  cycleRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
