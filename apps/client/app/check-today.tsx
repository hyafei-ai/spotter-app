import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { CYCLE_PHASES, CYCLE_PHASE_LABEL, phaseLine, type CycleMode, type CyclePhase, type DailyCheck } from '@spotter/core';
import { Banner, Button, IconButton, Screen, SectionLabel, SegmentedControl, Skeleton, Stepper, Tag, Text, TextField, useTheme, margin, space, touchMin } from '@spotter/ui';
import { SyncBanner } from '../src/SyncBanner';
import { tenant } from '../src/env';
import { localDate } from '../src/nutrition/store';
import { useDaily, type CheckInput } from '../src/daily/store';
import { readFor, useReadInputs } from '../src/daily/read';
import { TONE_LABEL, TONE_TAG } from '../src/daily/TodayRead';
import { useHealthStatus } from '../src/health/HealthRow';
import { health } from '../src/health/source';
import { useCycleToday } from '../src/cycle/hooks';
import { useSharedBriefFor, useTodayBriefContext } from '../src/brief/useBrief';
import { BriefBody } from '../src/brief/BriefBody';
import { PainCheck } from '../src/injury/PainCheck';

/** Modes where a manual phase is the fallback until periods are logged (Your cycle). */
const MANUAL_FALLBACK: CycleMode[] = ['natural', 'irregular', 'perimenopause'];

const SCALE = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }));

/** The 30-second daily check (client JTBD: train around body variance, share the read without extra effort). */
export default function CheckToday() {
  const { colors } = useTheme();
  const hydrated = useDaily((s) => s.hydrated);
  const settings = useDaily((s) => s.settings);
  const checks = useDaily((s) => s.checks);
  const submit = useDaily((s) => s.submit);
  const skipToday = useDaily((s) => s.skipToday);
  const healthStatus = useHealthStatus((s) => s.status);
  const inputs = useReadInputs();
  const briefCtx = useTodayBriefContext();
  const briefFor = useSharedBriefFor();
  const today = localDate();
  const existing = checks.find((c) => c.date === today);
  const first = tenant.coach.name.split(' ')[0] ?? '';
  // Cycle: the estimate from Your cycle when it's set up; the manual phase only as a fallback.
  const { profile: cycle, estimate } = useCycleToday();
  const cycleOn = settings.cycleTracking || cycle.mode !== 'not_tracking';
  const estimated = cycleOn ? estimate.phase : null;
  const manualFallback = !estimated && (cycle.mode === 'not_tracking' || (MANUAL_FALLBACK.includes(cycle.mode) && cycle.periods.length === 0));

  const [sleep, setSleep] = useState<number | null>(existing ? existing.sleepHours : null);
  const lastSleep = [...checks].reverse().find((c) => c.sleepHours != null)?.sleepHours ?? 7.5;
  const [sleepSource, setSleepSource] = useState<'health' | 'manual'>(existing?.sleepSource ?? 'manual');
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [soreness, setSoreness] = useState<number | null>(existing?.soreness ?? null);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [cycleOpen, setCycleOpen] = useState(!!existing?.cyclePhase);
  const [cyclePhase, setCyclePhase] = useState<CyclePhase | null>(existing?.cyclePhase ?? null);
  const [shareCycle, setShareCycle] = useState(existing?.shareCycle ?? false);
  const [share, setShare] = useState(existing?.shareWithCoach ?? settings.shareDefault);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Prefill sleep from the connected health app; typing over it makes it a manual entry.
  useEffect(() => {
    if (existing || healthStatus !== 'connected') return;
    let live = true;
    void health
      .readToday()
      .then((t) => {
        if (live && t.sleepHours != null) {
          setSleep(Math.round(t.sleepHours * 2) / 2);
          setSleepSource('health');
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [existing, healthStatus]);

  const input: CheckInput = {
    sleepHours: sleep,
    sleepSource: sleep == null ? null : sleepSource,
    energy,
    soreness,
    stress,
    // Keeps DailyCheck.cyclePhase filled from the estimate, so the read and the coach's view work as before.
    cyclePhase: estimated ?? (cycleOn && manualFallback ? cyclePhase : null),
    shareCycle: (estimated ?? (cycleOn && manualFallback ? cyclePhase : null)) ? shareCycle : false,
    note: note.trim() ? note.trim().slice(0, 300) : null,
    shareWithCoach: share,
  };
  const preview = useMemo(
    () => readFor(today, { ...input, id: 'preview', date: today, submittedAt: new Date().toISOString() } as DailyCheck, inputs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, inputs, sleep, energy, soreness, stress, cyclePhase, estimated, note],
  );
  const previewBrief = useMemo(() => briefCtx.build(preview), [briefCtx, preview]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/today'));

  if (!hydrated) {
    return (
      <Screen>
        <View style={{ padding: margin, gap: space[3], paddingTop: space[10] }}>
          <Skeleton width="50%" height={28} />
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </View>
      </Screen>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      await submit(input, (check) => readFor(today, check, inputs), briefFor);
      back();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    skipToday();
    back();
  };

  return (
    <Screen
      banner={
        <>
          <SyncBanner />
          {error ? <Banner tone="error" message="Couldn’t save on this phone. Try again." /> : null}
        </>
      }
      footer={
        <View style={{ gap: space[2] }}>
          <Button label={existing ? 'Update today’s check' : 'Save today’s check'} onPress={() => void save()} loading={saving} />
          {existing ? null : <Button label="Skip today" kind="quiet" onPress={skip} />}
        </View>
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          How are you today?
        </Text>
        <Text color="ink2">{existing ? 'Already in for today. Change anything and update it.' : 'About 30 seconds. Every answer is optional.'}</Text>
      </View>

      <View style={styles.body}>
        {sleep == null ? (
          <View style={{ gap: space[2] }}>
            <Text variant="label" color="ink2">
              Sleep last night
            </Text>
            {/* Never guess a number: the stepper starts from the client's last entry once they choose to add sleep. */}
            <Button label="Add last night’s sleep" kind="secondary" onPress={() => setSleep(lastSleep)} />
          </View>
        ) : (
          <View style={{ gap: space[2] }}>
            <Stepper
              label="Sleep last night"
              value={sleep}
              step={0.5}
              min={0}
              max={16}
              format={(v) => `${v} h`}
              unitLabel="hours"
              onChange={(v) => {
                setSleep(v);
                setSleepSource('manual');
              }}
            />
            <Text variant="caption" color="ink2">
              {sleepSource === 'health' ? 'From your health app. Change it if it looks off.' : 'Your best guess is fine.'}
            </Text>
          </View>
        )}
        <Scale label="Energy" low="Drained" high="Full of energy" value={energy} onChange={setEnergy} />
        <Scale label="Soreness" low="Fresh" high="Very sore" value={soreness} onChange={setSoreness} />
        <Scale label="Stress" low="Calm" high="Very stressed" value={stress} onChange={setStress} />
        <TextField label="Anything else? (optional)" value={note} onChangeText={setNote} maxLength={300} placeholder="Knee feels tight, long shift yesterday…" multiline />

        {cycleOn && estimated ? (
          <View style={{ gap: space[2] }}>
            <Text variant="label" color="ink2">
              Cycle
            </Text>
            <Text>{phaseLine(estimate)}</Text>
            <Pressable onPress={() => router.push('/cycle')} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: space[1] }}>
              <Text variant="bodyStrong" style={{ color: colors.brand }}>
                Not right? Log your period
              </Text>
            </Pressable>
            <Toggle label={`Share cycle phase with ${first}`} value={shareCycle} onChange={setShareCycle} />
          </View>
        ) : cycleOn && !manualFallback ? (
          <View style={{ gap: space[1] }}>
            <Text variant="label" color="ink2">
              Cycle
            </Text>
            <Text variant="callout" color="ink2">
              {estimate.note}
            </Text>
          </View>
        ) : cycleOn ? (
          <View style={{ gap: space[3] }}>
            <Pressable
              onPress={() => setCycleOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: cycleOpen }}
              style={[styles.disclosure, { minHeight: touchMin }]}
            >
              <Text style={{ flex: 1 }}>Track your cycle (optional, private)</Text>
              <Feather name={cycleOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink2} />
            </Pressable>
            {cycleOpen ? (
              <>
                <SegmentedControl
                  label="Cycle phase"
                  value={cyclePhase}
                  onChange={(v) => setCyclePhase(v === cyclePhase ? null : v)}
                  options={CYCLE_PHASES.map((p) => ({ value: p, label: CYCLE_PHASE_LABEL[p] }))}
                />
                {cyclePhase ? <Button label="Clear cycle phase" kind="quiet" full={false} onPress={() => setCyclePhase(null)} /> : null}
                <Toggle label={`Share cycle phase with ${first}`} value={shareCycle} onChange={setShareCycle} disabled={!cyclePhase} />
                <Text variant="caption" color="ink2">
                  Off unless you turn it on. Only used in your read, never to change your program on its own.
                </Text>
              </>
            ) : null}
          </View>
        ) : null}

        <PainCheck />

        <View style={{ gap: space[2] }}>
          <Toggle label={`Share today’s read with ${first}`} value={share} onChange={setShare} />
          <Text variant="caption" color="ink2">
            {share
              ? `${first} sees the read below${note.trim() ? ', including your note' : ''}${input.cyclePhase && !shareCycle ? ', but not your cycle phase' : ''}.`
              : `${first} sees that you checked in, and nothing else.`}
          </Text>
        </View>
      </View>

      <SectionLabel>Your read</SectionLabel>
      <View style={[styles.body, { paddingTop: 0, gap: space[1] }]} accessibilityLiveRegion="polite">
        <Tag label={TONE_LABEL[previewBrief.tone]} tone={TONE_TAG[previewBrief.tone]} />
        <BriefBody brief={previewBrief} />
        <Text variant="caption" color="ink2">
          A read, not a diagnosis. You choose what to do with it.
        </Text>
      </View>
    </Screen>
  );
}

function Scale({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="label" color="ink2">
        {label}
      </Text>
      <SegmentedControl label={`${label}, 1 ${low.toLowerCase()}, 5 ${high.toLowerCase()}`} value={value != null ? String(value) : null} onChange={(v) => onChange(Number(v))} options={SCALE} />
      <View style={styles.ends}>
        <Text variant="caption" color="ink2">
          1 · {low}
        </Text>
        <Text variant="caption" color="ink2">
          {high} · 5
        </Text>
      </View>
    </View>
  );
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.toggle, { minHeight: touchMin, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.brand, false: colors.line }}
        thumbColor={colors.surface}
        {...{ activeThumbColor: colors.surface }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[4], gap: space[5] },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  disclosure: { flexDirection: 'row', alignItems: 'center' },
});
