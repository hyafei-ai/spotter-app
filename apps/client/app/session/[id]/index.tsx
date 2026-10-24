import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Feather } from '@expo/vector-icons';
import {
  blockLabel,
  defaultEntry,
  formatRaceTime,
  formatRestClock,
  fromDisplay,
  indexLogged,
  isStrengthOnly,
  nextSlot,
  nextStep,
  planBlocks,
  roundToIncrement,
  runnerSpec,
  runnerView,
  sessionProgress,
  setKey,
  toDisplay,
  type Block,
  type ProgramExercise,
  type SetKey,
} from '@spotter/core';
import {
  Button,
  EmptyState,
  IconButton,
  ListRow,
  SegmentedControl,
  SetRow,
  Sheet,
  Stepper,
  Tag,
  Text,
  haptic,
  useTheme,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { SyncBanner } from '../../../src/SyncBanner';
import { tenant } from '../../../src/env';
import { isOn } from '../../../src/modules';
import { prescribed, resultText, targetText, w } from '../../../src/format';
import { previousSet, suggestionFor, useApp } from '../../../src/store';
import { useSessionCalibration } from '../../../src/cycle/hooks';
import { BlockSection } from '../../../src/blocks/BlockSection';

interface Entry {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  durationS: number | null;
  distanceM: number | null;
}

/** C-4 workout logger: full-screen log sheet, one tap to log a set that matches the prescription. */
export default function Logger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { active, completed, logSet, undoSet, setRest, swapExercise, keepLoad } = useApp();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const blockY = useRef<Record<string, number>>({});

  const session = active && active.sessionId === id ? active : null;
  const logged = useMemo(() => indexLogged(session?.sets ?? []), [session?.sets]);
  // Blocks (docs/ux/multisport.md 5.7): a strength-only plan runs exactly as before; otherwise the next thing to do
  // can be a set or a whole block (an AMRAP, intervals, a race sim…).
  const strengthOnly = session ? isStrengthOnly(session.plan) : true;
  const plan = session?.plan ?? null;
  const blocks = useMemo(() => (plan ? planBlocks(plan) : []), [plan]);
  const results = useMemo(() => session?.results ?? [], [session?.results]);
  const step = session && !strengthOnly ? nextStep(session.plan, session.sets, results) : null;
  const nextKey: SetKey | null = session ? (strengthOnly ? (nextSlot(session.plan, logged)?.key ?? null) : step?.kind === 'set' ? setKey(step.programExerciseId, step.setIndex) : null) : null;
  // Primitives only from `step`, so the React Compiler can keep the memoized entry below.
  const nextBlockId: string | null = step?.kind === 'block' ? step.block.id : null;
  const nextBlockStart: string | null = step?.kind === 'block' ? startLabel(step.block) : null;
  const progress = plan ? sessionProgress(plan, session?.sets ?? [], results) : { done: 0, planned: 0, sets: 0, blocks: 0 };
  // A block timer left running (the client stepped back to the sheet): one line to get back to it.
  const runner = session?.runner ?? null;
  const runningBlock = runner ? (blocks.find((b) => b.id === runner.blockId) ?? null) : null;

  const [selected, setSelected] = useState<SetKey | null>(null);
  const [justLogged, setJustLogged] = useState<SetKey | null>(null);
  const [swapFor, setSwapFor] = useState<ProgramExercise | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const currentKey: SetKey | null = selected ?? nextKey;
  const current = useMemo(() => {
    if (!session || !currentKey) return null;
    const [peId, idx] = currentKey.split(':');
    const exercise = session.plan.exercises.find((e) => e.id === peId);
    return exercise ? { exercise, setIndex: Number(idx), key: currentKey } : null;
  }, [session, currentKey]);

  // Cycle-phase calibration of suggested loads (docs/features/cycle.md). Off on the coach's lighter or
  // recovery version: that version is already lighter, and the two are never stacked.
  const cal = useSessionCalibration(session?.sessionId ?? null, session?.variant);
  const calibrate = cal.adjust;

  const suggestion = (e: ProgramExercise) =>
    session?.keptLoad[e.id] || session?.variant ? null : suggestionFor(e, completed);

  // Entry fields start at the prescription (UX C2: one tap when you did what was prescribed),
  // or at what was logged when editing. User edits are kept per set until it changes.
  const defaults = useMemo<Entry | null>(() => {
    if (!current) return null;
    const existing = logged.get(current.key);
    if (existing) {
      return {
        weightKg: existing.weightKg,
        reps: existing.reps,
        rpe: existing.rpe,
        durationS: existing.durationS,
        distanceM: existing.distanceM,
      };
    }
    const e = current.exercise;
    const prev = previousSet(completed, e.exerciseId, current.setIndex);
    // After the first set, carry over what the client actually used on the previous set today.
    const earlier = [...logged.values()]
      .filter((s) => s.programExerciseId === e.id && s.setIndex < current.setIndex)
      .sort((a, b) => b.setIndex - a.setIndex)[0];
    // No load jumps on the easier or recovery version the client chose from the read.
    const suggested = session?.keptLoad[e.id] || session?.variant
      ? null
      : (suggestionFor(e, completed)?.suggestedLoadKg ?? null);
    const p = e.sets.find((s) => s.index === current.setIndex);
    // Calibration adjusts only the suggestion (planned or progression load), never anything logged.
    const base = defaultEntry(e, current.setIndex, prev, calibrate(suggested ?? p?.loadKg ?? null));
    return {
      weightKg: earlier?.weightKg ?? base.weightKg,
      reps: base.reps,
      rpe: null,
      durationS: e.metric === 'time' ? (p?.durationS ?? 30) : null,
      distanceM: e.metric === 'distance' ? (p?.distanceM ?? 20) : null,
    };
  }, [current, logged, completed, session?.keptLoad, session?.variant, calibrate]);
  const [edited, setEdited] = useState<{ key: SetKey; entry: Entry } | null>(null);
  const entry = current && edited?.key === current.key ? edited.entry : defaults;
  const setEntry = (e: Entry) => current && setEdited({ key: current.key, entry: e });

  // Rest timer tick (the end time is persisted, so it survives backgrounding and app kills).
  useEffect(() => {
    if (!session?.restEndsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [session?.restEndsAt]);
  // A block timer running in the background: keep its line on the sheet current.
  const runnerLive = !!session?.runner && session.runner.state.startedAt != null && !session.runner.state.ended && session.runner.state.pausedAt == null;
  useEffect(() => {
    if (!runnerLive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runnerLive]);
  const restLeft = session?.restEndsAt ? Math.max(0, (session.restEndsAt - now) / 1000) : 0;
  const runningSpec = runningBlock ? runnerSpec(runningBlock) : null;
  const runningView = runningSpec && runner ? runnerView(runningSpec, runner.state, now) : null;
  useEffect(() => {
    if (session?.restEndsAt && restLeft <= 0) setRest(null, null);
  }, [restLeft, session?.restEndsAt, setRest]);

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + space[8] }}>
        <EmptyState
          message="This session isn’t open on this phone any more."
          actionLabel="Back to Today"
          onAction={() => router.replace('/today')}
        />
      </View>
    );
  }

  const planned = strengthOnly ? session.plan.exercises.reduce((n, e) => n + e.sets.length, 0) : progress.planned;
  const allDone = strengthOnly ? logged.size >= planned : progress.done >= progress.planned;
  const isEdit = current ? logged.has(current.key) : false;
  const first = tenant.coach.name.split(' ')[0] ?? '';
  const openBlock = (blockId: string, scoreOnly = false) => router.push(`/session/${session.sessionId}/block/${blockId}${scoreOnly ? '?score=1' : ''}`);


  const skipRest = async () => {
    const nid = session.restNotificationId;
    setRest(null, null);
    if (nid && Platform.OS !== 'web')
      await Notifications.cancelScheduledNotificationAsync(nid).catch(() => {});
  };

  const startRest = async (seconds: number, nextName: string | null) => {
    if (seconds <= 0) return;
    await skipRest();
    let nid: string | null = null;
    if (Platform.OS !== 'web') {
      nid = await Notifications.scheduleNotificationAsync({
        content: { title: 'Rest is up', body: nextName ? `Next: ${nextName}` : 'Back to it.' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.round(seconds),
        },
      }).catch(() => null);
    }
    setRest(Date.now() + seconds * 1000, nid);
  };

  const log = async () => {
    if (!current || !entry) return;
    const e = current.exercise;
    const swap = session.swaps[e.id];
    haptic.success();
    setJustLogged(current.key);
    setSelected(null);
    const setNo = current.setIndex + 1;
    void logSet({
      programExerciseId: e.id,
      exerciseId: swap?.exerciseId ?? e.exerciseId,
      setIndex: current.setIndex,
      weightKg: e.metric === 'weight_reps' ? entry.weightKg : null,
      reps: e.metric === 'weight_reps' || e.metric === 'bodyweight_reps' ? entry.reps : null,
      rpe: e.trackRpe ? entry.rpe : null,
      durationS: e.metric === 'time' ? entry.durationS : null,
      distanceM: e.metric === 'distance' ? entry.distanceM : null,
    });
    const key = current.key;
    toast({
      message: `${isEdit ? 'Updated' : 'Logged'} ${swap?.name ?? e.name}, set ${setNo}`,
      actionLabel: isEdit ? undefined : 'Undo',
      onAction: isEdit
        ? undefined
        : () => {
            void undoSet(e.id, current.setIndex);
            setJustLogged(null);
            setSelected(key);
          },
    });
    if (!isEdit) {
      if (strengthOnly) {
        const after = nextSlot(session.plan, new Map([...logged, [key, {} as never]]));
        void startRest(
          e.restS,
          after ? (session.swaps[after.exercise.id]?.name ?? after.exercise.name) : null,
        );
        if (after && after.exercise.id !== e.id) {
          const y = blockY.current[after.exercise.id];
          if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
        }
      } else {
        const after = nextStep(session.plan, [...session.sets, { programExerciseId: e.id, setIndex: current.setIndex }], results);
        const afterName = after?.kind === 'set' ? (session.plan.exercises.find((x) => x.id === after.programExerciseId)?.name ?? null) : after?.kind === 'block' ? blockLabel(after.block) : null;
        // No rest timer before a timed block: its own clock starts when the client is ready.
        if (after?.kind !== 'block') void startRest(e.restS, afterName);
        const target = after?.kind === 'set' ? after.programExerciseId : after?.kind === 'block' ? after.block.id : null;
        if (target && target !== e.id) {
          const y = blockY.current[target];
          if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
        }
      }
    }
  };

  const unit = tenant.units;
  const inc = tenant.weightIncrement;

  const renderExercise = (e: ProgramExercise) => {
          const s = suggestion(e);
          const swap = session.swaps[e.id];
          return (
            <View
              key={e.id}
              onLayout={(ev) => (blockY.current[e.id] = ev.nativeEvent.layout.y)}
              style={styles.block}
            >
              <View style={styles.exHead}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline">{swap?.name ?? e.name}</Text>
                  <View style={styles.tags}>
                    {e.supersetGroup ? <Tag label={`Superset ${e.supersetGroup}`} /> : null}
                    {e.sets[0]?.rpe != null ? <Tag label={`RPE ${e.sets[0].rpe}`} /> : null}
                    {e.tempo ? <Tag label={`Tempo ${e.tempo}`} /> : null}
                    {swap ? <Tag label={`Swapped from ${e.name}`} /> : null}
                  </View>
                  {e.note ? (
                    <Text variant="callout" color="ink2">
                      {e.note}
                    </Text>
                  ) : null}
                </View>
                {isOn('formChecks') ? (
                  <IconButton
                    icon="video"
                    label={`Send a form check of ${swap?.name ?? e.name}`}
                    onPress={() => {
                      // Attach to the set in progress, else the last one logged for this exercise.
                      const done = session.sets
                        .filter((x) => x.programExerciseId === e.id)
                        .map((x) => x.setIndex);
                      const setIdx =
                        current?.exercise.id === e.id
                          ? current.setIndex
                          : done.length
                            ? Math.max(...done)
                            : '';
                      router.push(`/form-check/new?pe=${e.id}&set=${setIdx}`);
                    }}
                  />
                ) : null}
                {e.alternatives.length ? (
                  <IconButton
                    icon="repeat"
                    label={`Swap ${e.name} for an approved alternative`}
                    onPress={() => setSwapFor(e)}
                  />
                ) : null}
              </View>

              {s ? (
                <View
                  style={[
                    styles.suggest,
                    { borderLeftColor: colors.brand, backgroundColor: colors.surface },
                  ]}
                >
                  <Text variant="label" style={{ color: colors.brand }}>
                    Suggested — your coach approved this rule
                  </Text>
                  <Text variant="bodyStrong">
                    {prescribed(s.suggestedLoadKg)} today (was {prescribed(s.previousLoadKg)})
                  </Text>
                  <Text variant="callout" color="ink2">
                    {s.reason}
                  </Text>
                  <Pressable
                    onPress={() => keepLoad(e.id)}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={{ alignSelf: 'flex-start', paddingVertical: space[1] }}
                  >
                    <Text variant="bodyStrong" style={{ color: colors.brand }}>
                      Keep {prescribed(s.previousLoadKg)}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={[styles.cols, { borderBottomColor: colors.line }]}>
                <Text variant="label" color="ink2" style={{ width: 24 }}>
                  Set
                </Text>
                <Text variant="label" color="ink2" style={{ flex: 1 }}>
                  Target
                </Text>
                <Text variant="label" color="ink2" style={{ flex: 1 }}>
                  Last time
                </Text>
                <Text variant="label" color="ink2" style={{ flex: 1.1, textAlign: 'right' }}>
                  {e.metric === 'weight_reps'
                    ? `${unit} × reps`
                    : e.metric === 'distance'
                      ? 'Metres'
                      : e.metric === 'time'
                        ? 'Seconds'
                        : 'Reps'}
                </Text>
              </View>

              {e.sets.map((p) => {
                const key = setKey(e.id, p.index);
                const done = logged.get(key);
                const isCurrent = current?.key === key;
                const prev = previousSet(completed, e.exerciseId, p.index);
                return (
                  <SetRow
                    key={key}
                    setNumber={p.index + 1}
                    target={targetText(e, p.index, cal.adjust(s?.suggestedLoadKg ?? p.loadKg))}
                    previous={resultText(e, prev)}
                    state={isCurrent ? 'active' : done ? 'logged' : 'upcoming'}
                    result={done ? resultText(e, done) : undefined}
                    justLogged={justLogged === key}
                    onPress={() => setSelected(key)}
                  >
                    {isCurrent && entry ? (
                      <EntryFields
                        exercise={e}
                        entry={entry}
                        onChange={setEntry}
                        unit={unit}
                        inc={inc}
                      />
                    ) : null}
                  </SetRow>
                );
              })}
            </View>
          );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top }}>
      <View style={styles.header}>
        <IconButton
          icon="x"
          label="Close. Your session stays open."
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
        />
        <View style={{ flex: 1 }}>
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {session.plan.title}
          </Text>
          <Text variant="caption" color="ink2">
            {strengthOnly ? `${logged.size} of ${planned} sets` : `${progress.done} of ${progress.planned} done`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/session/${session.sessionId}/finish`)}
          hitSlop={8}
          style={styles.finishLink}
        >
          <Text variant="bodyStrong" style={{ color: colors.brand }}>
            Finish
          </Text>
        </Pressable>
      </View>
      <SyncBanner />

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: space[12] }}>
        {cal.line ? (
          <View style={[styles.suggest, { borderLeftColor: colors.brand, backgroundColor: colors.surface }]} accessibilityLiveRegion="polite">
            <Text variant="callout">{cal.active ? cal.line : 'Using planned loads today.'}</Text>
            <Pressable onPress={() => cal.setOff(cal.active)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: space[1] }}>
              <Text variant="bodyStrong" style={{ color: colors.brand }}>
                {cal.active ? 'Use planned loads instead' : 'Use your cycle-adjusted loads'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {runningBlock && runningView && runningView.phase !== 'done' ? (
          <Pressable
            onPress={() => openBlock(runningBlock.id)}
            accessibilityRole="button"
            style={[styles.suggest, { borderLeftColor: colors.brand, backgroundColor: colors.surface }]}
          >
            <Text variant="bodyStrong">{`${blockLabel(runningBlock)} is running · ${formatRaceTime(runningView.clockSec) === '—' ? '0:00' : formatRaceTime(runningView.clockSec)}`}</Text>
            <Text variant="bodyStrong" style={{ color: colors.brand }}>
              Back to the timer
            </Text>
          </Pressable>
        ) : null}
        {strengthOnly
          ? session.plan.exercises.map((e) => renderExercise(e))
          : blocks.map((b) =>
              b.kind === 'strength' ? (
                <View key={b.id}>{b.exerciseIds.map((x) => session.plan.exercises.find((e) => e.id === x)).filter((e): e is ProgramExercise => !!e).map((e) => renderExercise(e))}</View>
              ) : (
                <View key={b.id} onLayout={(ev) => (blockY.current[b.id] = ev.nativeEvent.layout.y)}>
                  <BlockSection block={b} result={results.find((r) => r.blockId === b.id) ?? null} isNext={nextBlockId === b.id && !current} first={first} onScore={() => openBlock(b.id, true)} />
                </View>
              ),
            )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, space[3]),
            borderTopColor: colors.line,
            backgroundColor: colors.paper,
          },
        ]}
      >
        {restLeft > 0 ? (
          <View style={styles.rest} accessibilityLiveRegion="polite">
            <Feather name="clock" size={16} color={colors.ink2} />
            <Text
              variant="bodyStrong"
              tabular
              accessibilityLabel={`Rest, ${Math.ceil(restLeft)} seconds left`}
            >
              Rest {formatRestClock(restLeft)}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => void skipRest()} accessibilityRole="button" hitSlop={10}>
              <Text variant="bodyStrong" style={{ color: colors.brand }}>
                Skip rest
              </Text>
            </Pressable>
          </View>
        ) : null}
        {current && entry ? (
          <Button
            label={`${isEdit ? 'Update' : 'Log'} set ${current.setIndex + 1}${summary(current.exercise, entry)}`}
            icon="check"
            onPress={() => void log()}
          />
        ) : nextBlockId && nextBlockStart ? (
          <Button label={nextBlockStart} icon="play" onPress={() => openBlock(nextBlockId)} />
        ) : allDone ? (
          <Button
            label="Finish session"
            onPress={() => router.push(`/session/${session.sessionId}/finish`)}
          />
        ) : null}
      </View>

      <Sheet
        visible={!!swapFor}
        title={swapFor ? `Swap ${swapFor.name}` : ''}
        onClose={() => setSwapFor(null)}
      >
        {swapFor ? (
          <>
            <Text
              variant="callout"
              color="ink2"
              style={{ paddingHorizontal: margin, paddingBottom: space[2] }}
            >
              These alternatives are approved by {tenant.coach.name.split(' ')[0]}. Your targets
              stay the same.
            </Text>
            <ListRow
              title={swapFor.name}
              subtitle="As programmed"
              right={
                !session.swaps[swapFor.id] ? (
                  <Feather name="check" size={20} color={colors.brand} />
                ) : undefined
              }
              onPress={() => {
                swapExercise(swapFor.id, null);
                setSwapFor(null);
              }}
            />
            {swapFor.alternatives.map((a, i) => (
              <ListRow
                key={a.exerciseId}
                title={a.name}
                right={
                  session.swaps[swapFor.id]?.exerciseId === a.exerciseId ? (
                    <Feather name="check" size={20} color={colors.brand} />
                  ) : undefined
                }
                last={i === swapFor.alternatives.length - 1}
                onPress={() => {
                  swapExercise(swapFor.id, a);
                  setSwapFor(null);
                }}
              />
            ))}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

/** The pinned button for a block that's next: "Start AMRAP 12:00", "Start intervals", "Start race sim", "Enter score". */
function startLabel(b: Block): string {
  switch (b.kind) {
    case 'amrap':
      return `Start AMRAP ${formatRaceTime(b.durationSec)}`;
    case 'emom':
      return `Start EMOM ${formatRaceTime(b.intervalSec * b.rounds)}`;
    case 'tabata':
      return 'Start tabata';
    case 'interval_amrap':
      return `Start ${b.rounds} × AMRAP`;
    case 'intervals':
      return 'Start intervals';
    case 'station_race':
      return 'Start race sim';
    case 'timed':
      return `Start ${formatRaceTime(b.durationSec)}`;
    case 'for_time':
    case 'rounds_for_time':
    case 'rep_scheme':
      return `Start ${blockLabel(b)}`;
    default:
      return 'Enter score';
  }
}

function summary(e: ProgramExercise, entry: Entry): string {
  switch (e.metric) {
    case 'weight_reps':
      return ` · ${w(entry.weightKg)} × ${entry.reps ?? 0}`;
    case 'bodyweight_reps':
      return ` · ${entry.reps ?? 0} reps`;
    case 'time':
      return ` · ${entry.durationS ?? 0} s`;
    case 'distance':
      return ` · ${entry.distanceM ?? 0} m`;
  }
}

function EntryFields({
  exercise: e,
  entry,
  onChange,
  unit,
  inc,
}: {
  exercise: ProgramExercise;
  entry: Entry;
  onChange: (e: Entry) => void;
  unit: 'kg' | 'lb';
  inc: number;
}) {
  // kg tenants see the exact load; lb tenants see the converted load on their plate increment.
  const raw = toDisplay(entry.weightKg ?? 0, unit);
  const shownWeight = unit === 'kg' ? Math.round(raw * 100) / 100 : roundToIncrement(raw, inc);
  return (
    <>
      <View style={styles.steppers}>
        {e.metric === 'weight_reps' ? (
          <Stepper
            label={`Weight (${unit})`}
            unitLabel={unit === 'kg' ? 'kilograms' : 'pounds'}
            value={shownWeight}
            step={inc}
            max={unit === 'kg' ? 500 : 1100}
            format={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
            onChange={(v) => onChange({ ...entry, weightKg: fromDisplay(v, unit) })}
          />
        ) : null}
        {e.metric === 'weight_reps' || e.metric === 'bodyweight_reps' ? (
          <Stepper
            label="Reps"
            unitLabel="reps"
            value={entry.reps ?? 0}
            step={1}
            max={100}
            onChange={(reps) => onChange({ ...entry, reps })}
          />
        ) : null}
        {e.metric === 'distance' ? (
          <Stepper
            label="Distance (m)"
            unitLabel="metres"
            value={entry.distanceM ?? 0}
            step={5}
            max={5000}
            onChange={(distanceM) => onChange({ ...entry, distanceM })}
          />
        ) : null}
        {e.metric === 'time' ? (
          <Stepper
            label="Time (s)"
            unitLabel="seconds"
            value={entry.durationS ?? 0}
            step={5}
            max={3600}
            onChange={(durationS) => onChange({ ...entry, durationS })}
          />
        ) : null}
      </View>
      {e.trackRpe ? (
        <View style={{ gap: space[1] }}>
          <Text variant="label" color="ink2">
            RPE (optional)
          </Text>
          <SegmentedControl
            label="RPE, how hard the set felt out of 10"
            value={entry.rpe != null ? String(entry.rpe) : null}
            onChange={(v) => onChange({ ...entry, rpe: Number(v) })}
            options={['6', '7', '8', '9', '10'].map((v) => ({ value: v, label: v }))}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    gap: space[1],
  },
  finishLink: { paddingHorizontal: space[3], minHeight: 44, justifyContent: 'center' },
  block: { paddingTop: space[5] },
  exHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: margin,
    gap: space[2],
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
  suggest: {
    marginHorizontal: margin,
    marginTop: space[3],
    padding: space[3],
    borderLeftWidth: 3,
    borderRadius: 6,
    gap: 2,
  },
  cols: {
    flexDirection: 'row',
    paddingHorizontal: margin,
    paddingTop: space[4],
    paddingBottom: space[1],
    gap: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  footer: {
    paddingHorizontal: margin,
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
  rest: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 32 },
});
