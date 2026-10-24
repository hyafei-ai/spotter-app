import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EMPTY_SCORE,
  NEW_RUNNER,
  blockKey,
  blockKindLine,
  blockLabel,
  blockLines,
  distanceText,
  formatRaceTime,
  movementLine,
  paceText,
  planBlocks,
  resultLine,
  runnerScore,
  runnerSpec,
  runnerSplits,
  runnerView,
  segmentLine,
  settle,
  targetText,
  type Block,
  type BlockScore,
  type RunnerSpec,
  type RunnerView,
} from '@spotter/core';
import { Button, EmptyState, IconButton, Text, haptic, useTheme, useToast, fonts, margin, radius, space } from '@spotter/ui';
import { tenant } from '../../../../src/env';
import { useApp } from '../../../../src/store';
import { ScoreEntry, type ScoreDraft } from '../../../../src/blocks/ScoreEntry';

/**
 * The block runner (docs/ux/multisport.md 5.8–5.9): big numerals, one big button, then the score. The clock is the
 * core state machine (blockRunner.ts) fed with taps and the time now; the state is saved with the session, so the
 * clock is right again after the app is closed or killed. `?score=1` opens score entry straight away (done without
 * the timer).
 */
export default function BlockRunner() {
  const { id, blockId, score: scoreOnly } = useLocalSearchParams<{ id: string; blockId: string; score?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const active = useApp((s) => s.active);
  const session = active && active.sessionId === id ? active : null;
  const block = session ? planBlocks(session.plan).find((b) => b.id === blockId) : null;
  const spec = useMemo(() => (block ? runnerSpec(block) : null), [block]);
  const runner = session?.runner?.blockId === blockId ? session.runner.state : NEW_RUNNER;
  const [now, setNow] = useState(() => Date.now());
  const running = runner.startedAt != null && !runner.ended && runner.pausedAt == null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [running]);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/session/${id}`));
  if (!session || !block) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + space[8] }}>
        <EmptyState message="This part of the session isn’t open on this phone any more." actionLabel="Back" onAction={close} />
      </View>
    );
  }
  const existing = session.results?.find((r) => r.blockId === block.id) ?? null;
  const view = spec ? runnerView(spec, runner, now) : null;
  const showScore = scoreOnly === '1' || !spec || view?.phase === 'done';

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top }}>
      <View style={styles.header}>
        <IconButton icon="x" label={running ? 'Back to the session. The clock keeps running.' : 'Back to the session'} onPress={close} />
        <View style={{ flex: 1 }}>
          <Text variant="label" color="ink2" numberOfLines={1}>
            {blockKindLine(block)}
          </Text>
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {blockLabel(block)}
          </Text>
        </View>
      </View>
      {showScore ? (
        <Score block={block} spec={spec} initialFromRunner={!!spec && runner.startedAt != null} existing={existing?.score ?? null} />
      ) : (
        <Clock block={block} spec={spec!} view={view!} now={now} onNow={setNow} />
      )}
    </View>
  );
}

/* ---------- the clock ---------- */

function Clock({ block, spec, view, now, onNow }: { block: Block; spec: RunnerSpec; view: RunnerView; now: number; onNow: (n: number) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const runnerEvent = useApp((s) => s.runnerEvent);
  const state = useApp((s) => s.active?.runner?.state) ?? NEW_RUNNER;
  const ev = (type: 'start' | 'pause' | 'resume' | 'lap' | 'undo' | 'finish', early = false) => {
    const at = Date.now();
    onNow(at);
    if (type === 'lap') haptic.success();
    runnerEvent(block.id, type === 'finish' ? { type, at, early } : { type, at });
  };

  const phaseWord =
    view.phase === 'ready' ? 'Ready' : view.phase === 'lead_in' ? 'Get ready' : view.phase === 'paused' ? 'Paused' : view.phase === 'rest' ? 'Rest' : spec.mode === 'up' && view.capLeftSec != null && view.capLeftSec <= 60 ? 'Time cap soon' : 'Work';
  const clock = view.phase === 'lead_in' ? String(view.clockSec) : formatRaceTime(view.clockSec) === '—' ? '0:00' : formatRaceTime(view.clockSec);

  // What to do now, by kind.
  const lines = blockLines(block, tenant.units);
  let where: string | null = null;
  let now1: string[] = lines;
  let next: string | null = null;
  switch (block.kind) {
    case 'amrap':
    case 'interval_amrap':
      where = `${view.laps} round${view.laps === 1 ? '' : 's'} done${block.kind === 'interval_amrap' ? ` · window ${Math.min(view.index, view.of ?? 1)} of ${view.of}` : ''}`;
      break;
    case 'emom':
      where = `${block.intervalSec === 60 ? 'Minute' : 'Round'} ${view.index} of ${view.of}`;
      now1 = block.rotate && block.movements.length > 1 ? [movementLine(block.movements[(view.index - 1) % block.movements.length]!, tenant.units)] : lines;
      next = block.rotate && block.movements.length > 1 ? `Next: ${movementLine(block.movements[view.index % block.movements.length]!, tenant.units)}` : null;
      break;
    case 'tabata':
      where = `Round ${view.index} of ${view.of}`;
      break;
    case 'rounds_for_time':
    case 'rep_scheme':
      where = `Round ${view.index} of ${view.of}${block.kind === 'rep_scheme' ? ` · ${block.scheme[view.index - 1]} reps` : ''}`;
      break;
    case 'intervals': {
      const each = block.distanceM != null ? distanceText(block.distanceM) : `${block.workSec} s`;
      where = `${view.phase === 'rest' ? 'Next: rep' : 'Rep'} ${view.index} of ${view.of} · ${each}`;
      const splits = runnerSplits(spec, state);
      const last = splits.at(-1);
      now1 = [block.target ? targetText(block.target).replace(/^target /, 'Target ') : null, last ? `Last rep ${formatRaceTime(last.sec)}${last.distanceM && last.distanceM !== 1000 ? ` (${paceText((last.sec / last.distanceM) * 1000, block.modality)})` : ''}` : null].filter((x): x is string => !!x);
      break;
    }
    case 'station_race': {
      const seg = block.segments[Math.min(view.index - 1, block.segments.length - 1)]!;
      const runs = block.segments.filter((s) => s.kind === 'run').length;
      const runNo = block.segments.slice(0, view.index).filter((s) => s.kind === 'run').length;
      where = seg.kind === 'run' ? `Run ${runNo} of ${runs}` : `Station ${view.index - runNo} of ${block.segments.length - runs}`;
      now1 = [segmentLine(seg, tenant.units), `Total ${formatRaceTime(view.elapsedSec) === '—' ? '0:00' : formatRaceTime(view.elapsedSec)}`];
      const nx = block.segments[view.index];
      next = nx ? `Next: ${segmentLine(nx, tenant.units)}` : 'Last one';
      break;
    }
    default:
      break;
  }

  // The one big button.
  let primary: { label: string; onPress: () => void; disabled?: boolean } | null = null;
  if (view.phase === 'ready') primary = { label: 'Start', onPress: () => ev('start') };
  else if (view.phase === 'paused') primary = { label: 'Resume', onPress: () => ev('resume') };
  else if (view.phase === 'lead_in') primary = null;
  else if (spec.lap === 'round' && spec.mode !== 'up') primary = { label: view.phase === 'rest' ? 'Rest' : '+1 round', onPress: () => ev('lap'), disabled: !view.canLap };
  else if (spec.mode === 'up') primary = view.canLap ? { label: `Round ${view.index} done`, onPress: () => ev('lap') } : { label: 'Done', onPress: () => ev('finish') };
  else if (spec.mode === 'intervals') primary = view.phase === 'rest' ? { label: `Rest ${formatRaceTime(view.clockSec)}`, onPress: () => undefined, disabled: true } : { label: `Rep ${view.index} done`, onPress: () => ev('lap') };
  else if (spec.mode === 'segments') {
    const seg = block.kind === 'station_race' ? block.segments[view.index - 1] : null;
    primary = { label: `Done: ${seg?.name ?? 'segment'}`, onPress: () => ev('lap') };
  }

  const started = view.phase !== 'ready';
  const undoLeft = state.lastLapWall != null ? Math.max(0, 5 - Math.floor((now - state.lastLapWall) / 1000)) : 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.center} accessibilityLiveRegion="polite">
        <Text variant="label" style={{ color: view.phase === 'rest' || view.phase === 'paused' ? colors.ink2 : colors.brand }}>
          {phaseWord}
        </Text>
        <Text
          style={[styles.clock, { color: colors.ink }]}
          accessibilityLabel={`${phaseWord}. ${view.direction === 'down' ? `${view.clockSec} seconds left` : `${view.clockSec} seconds`}`}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {clock}
        </Text>
        {where ? (
          <Text variant="headline" align="center">
            {where}
          </Text>
        ) : null}
        {view.capLeftSec != null && started ? (
          <Text variant="callout" color="ink2">{`Cap in ${formatRaceTime(view.capLeftSec) === '—' ? '0:00' : formatRaceTime(view.capLeftSec)}`}</Text>
        ) : null}
        <View style={styles.lines}>
          {now1.map((l, i) => (
            <Text key={i} variant={i === 0 && block.kind !== 'amrap' ? 'bodyStrong' : 'body'} align="center">
              {l}
            </Text>
          ))}
          {next ? (
            <Text variant="callout" color="ink2" align="center">
              {next}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]), borderTopColor: colors.line }]}>
        {view.canUndo && (spec.lap !== 'round' ? undoLeft > 0 : true) && started ? (
          <Pressable onPress={() => ev('undo')} accessibilityRole="button" style={[styles.undo, { borderColor: colors.line }]} hitSlop={6}>
            <Text variant="bodyStrong">{spec.lap === 'round' ? 'Undo last round' : `Undo (${undoLeft} s)`}</Text>
          </Pressable>
        ) : null}
        {primary ? (
          <Pressable
            onPress={primary.disabled ? undefined : primary.onPress}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!primary.disabled }}
            style={({ pressed }) => [styles.big, { backgroundColor: primary.disabled ? colors.surface : colors.brand, borderColor: colors.line, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.bigLabel, { color: primary.disabled ? colors.ink2 : colors.brandInk }]} numberOfLines={1} adjustsFontSizeToFit>
              {primary.label}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.bigSpacer} />
        )}
        {started ? (
          <View style={styles.quiet}>
            {view.phase === 'paused' ? null : (
              <Button label="Pause" kind="quiet" full={false} onPress={() => ev('pause')} disabled={view.phase === 'lead_in'} />
            )}
            <Button label={spec.mode === 'up' ? 'End without finishing' : 'End early'} kind="quiet" full={false} onPress={() => ev('finish', true)} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ---------- the score ---------- */

function Score({ block, spec, initialFromRunner, existing }: { block: Block; spec: RunnerSpec | null; initialFromRunner: boolean; existing: BlockScore | null }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const state = useApp((s) => s.active?.runner?.state) ?? NEW_RUNNER;
  const { saveBlockResult, undoBlockResult, clearRunner } = useApp();
  const [openedAt] = useState(() => Date.now());
  const settled = spec ? settle(spec, state, openedAt) : state;
  // Unscored blocks keep no splits: eight "1:00" minutes of an EMOM say nothing.
  const splits = spec && initialFromRunner && block.scoring !== 'none' ? runnerSplits(spec, settled) : [];
  const initial = existing ?? (spec && initialFromRunner ? runnerScore(block, spec, settled) : { ...EMPTY_SCORE });
  const needsTime = block.scoring === 'time' && !['intervals', 'station_race'].includes(block.kind) && !initial.capped;
  const [draft, setDraft] = useState<ScoreDraft>({ score: initial, rpe: null, valid: !needsTime || (initial.timeSec ?? 0) > 0, problem: needsTime && !initial.timeSec ? 'Enter your time' : undefined });
  const ended = settled.ended;
  const save = async () => {
    const r = await saveBlockResult({ blockId: block.id, kind: block.kind, key: blockKey(block), label: blockLabel(block).slice(0, 80), scoring: block.scoring, score: draft.score, splits, rpe: draft.rpe });
    haptic.success();
    if (r) toast({ message: `Saved · ${resultLine(r, tenant.units)}`, actionLabel: 'Undo', onAction: () => void undoBlockResult(block.id) });
    router.back();
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View style={styles.scoreHead}>
          <Text variant="label" color="ink2">
            {ended === 'capped' ? 'Time cap' : ended === 'ended_early' ? 'Ended early' : initialFromRunner ? 'Done' : 'Enter your score'}
          </Text>
          <Text variant="display">{block.scoring === 'none' ? 'Nice work' : 'Your score'}</Text>
          {ended === 'capped' ? <Text color="ink2">{`Capped at ${formatRaceTime(block.timeCapSec)}: how much did you get done?`}</Text> : null}
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: space[8] }} keyboardShouldPersistTaps="handled">
          <ScoreEntry block={block} initial={initial} splits={splits} onChange={setDraft} />
        </ScrollView>
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]), borderTopColor: colors.line }]}>
        <Button label={block.scoring === 'none' ? 'Mark done' : 'Save score'} onPress={() => void save()} disabled={!draft.valid} disabledReason={draft.problem} />
        {initialFromRunner ? (
          <Button
            label="Start the clock again"
            kind="quiet"
            onPress={() => {
              clearRunner();
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], paddingVertical: space[2], gap: space[1] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: margin, gap: space[2] },
  clock: { fontFamily: fonts.display, fontSize: 112, lineHeight: 120, fontVariant: ['tabular-nums'], textAlign: 'center', alignSelf: 'stretch' },
  lines: { gap: 2, alignItems: 'center', marginTop: space[3] },
  footer: { paddingHorizontal: margin, paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, gap: space[2] },
  big: { minHeight: 88, borderRadius: radius.sheet, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4], borderWidth: StyleSheet.hairlineWidth },
  bigLabel: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44 },
  bigSpacer: { minHeight: 0 },
  quiet: { flexDirection: 'row', justifyContent: 'space-between' },
  undo: { alignSelf: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: space[4], minHeight: 44, justifyContent: 'center' },
  scoreHead: { paddingHorizontal: margin, paddingTop: space[4], paddingBottom: space[4], gap: space[1] },
});
