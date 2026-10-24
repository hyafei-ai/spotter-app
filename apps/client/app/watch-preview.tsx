import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { watchBranding, type TenantConfig, type WatchBlock, type WatchContext, type WatchSessionPlan } from '@spotter/core';
import { DEMO_WATCH_HR, DEMO_WATCH_HYBRID, DEMO_WATCH_RECOVERY } from '@spotter/core/demo';
import demoTenants from '@spotter/core/demo-tenants.json';
import { IconButton, Screen, SectionLabel, SegmentedControl, Text, useTheme, margin, space } from '@spotter/ui';
import { tenant } from '../src/env';
import { useWatchContext } from '../src/watch/context';
import {
  CheckInScreen,
  Complications,
  DoneScreen,
  FinishScreen,
  IntervalScreen,
  MenuScreen,
  MessagesScreen,
  NotificationScreen,
  PausedScreen,
  RecoveryScreen,
  ReplyScreen,
  RestScreen,
  RpeScreen,
  SetScreen,
  StationScreen,
  TimedScreen,
  TodayRowsScreen,
  TodayScreen,
  WATCH_SIZES,
  WatchFrame,
  setTarget,
  type WatchSize,
} from '../src/watch/preview/WatchScreens';

/**
 * Apple Watch preview (web and demo builds): the redesigned watch app drawn at 41, 45 and 49 mm with the demo
 * data, in each demo trainer's brand, so the product owner can see it without a watch. The screens mirror the
 * SwiftUI views in apps/client/watch/SpotterWatch (docs/ux/watch.md). Everything shown is MOCK demo data.
 */
const TENANTS = Object.values(demoTenants) as TenantConfig[];
type SessionKind = 'strength' | 'conditioning';

export default function WatchPreview() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const live = useWatchContext();
  const [slug, setSlug] = useState(tenant.slug in demoTenants ? tenant.slug : TENANTS[0]!.slug);
  const [size, setSize] = useState<WatchSize>(45);
  const [kind, setKind] = useState<SessionKind>('strength');
  const [openedAt] = useState(() => Date.now());
  const t = TENANTS.find((x) => x.slug === slug) ?? TENANTS[0]!;
  const brand = useMemo(() => watchBranding(t), [t]);
  const wide = width >= 900;
  const k = wide ? 1.35 : Math.min(1.25, (width - margin * 2 - 24) / (WATCH_SIZES[size].w + 16));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  // Today's real demo context (same builder the phone sends to the watch), with the chosen brand and, for the
  // conditioning view, the MOCK hybrid session.
  const ctx: WatchContext = useMemo(() => {
    const plans = kind === 'conditioning' ? [DEMO_WATCH_HYBRID] : live.plans;
    return {
      ...live,
      branding: brand,
      day: live.day.kind === 'session' || kind === 'conditioning' ? { kind: 'session' } : live.day,
      plans,
      brief: live.brief && plans[0] ? { ...live.brief, action: { kind: 'start', version: plans[0].version, label: `Start ${plans[0].label}` } } : live.brief,
    };
  }, [live, brand, kind]);
  const plan = ctx.plans[0] ?? null;

  const frame = (label: string, child: ReactNode, opts: { caption?: string; clock?: string | null } = {}) => (
    <View key={label} style={styles.cell}>
      <WatchFrame size={size} k={k} brand={brand} label={`Watch screen: ${label}`} clock={opts.clock}>
        {child}
      </WatchFrame>
      <Text variant="bodyStrong">{label}</Text>
      {opts.caption ? (
        <Text variant="caption" color="ink2" style={{ maxWidth: (WATCH_SIZES[size].w + 16) * k }}>
          {opts.caption}
        </Text>
      ) : null}
    </View>
  );

  const strength = plan?.blocks.findIndex((b) => b.kind === 'strength') ?? -1;
  const sBlock = strength >= 0 ? (plan!.blocks[strength] as Extract<WatchBlock, { kind: 'strength' }>) : null;
  const total = plan?.order.length ?? 0;
  const find = <K extends WatchBlock['kind']>(kk: K) => plan?.blocks.find((b): b is Extract<WatchBlock, { kind: K }> => b.kind === kk) ?? null;
  const interval = find('interval');
  const station = find('station');
  const timed = find('timed');

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Apple Watch
        </Text>
        <Text color="ink2">{`How ${t.appName} looks on a client’s wrist: today’s brief, the session with the crown, and ${brand.coachFirst}’s messages. Demo data (MOCK). The real app needs an iPhone build with the watch.`}</Text>
      </View>

      <View style={styles.controls}>
        <Text variant="label" color="ink2">
          Trainer’s brand
        </Text>
        <SegmentedControl label="Trainer’s brand" value={slug} onChange={setSlug} options={TENANTS.map((x) => ({ value: x.slug, label: x.appName }))} />
        <Text variant="label" color="ink2">
          Watch size
        </Text>
        <SegmentedControl<string> label="Watch size" value={String(size)} onChange={(v) => setSize(Number(v) as WatchSize)} options={[{ value: '41', label: '41 mm' }, { value: '45', label: '45 mm' }, { value: '49', label: '49 mm' }]} />
        <Text variant="label" color="ink2">
          Session
        </Text>
        <SegmentedControl<SessionKind>
          label="Session"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'strength', label: plan && kind === 'strength' ? `Strength · ${plan.title}` : 'Strength' },
            { value: 'conditioning', label: 'Conditioning (MOCK)' },
          ]}
        />
      </View>

      <SectionLabel>Try it</SectionLabel>
      <View style={styles.tryRow}>
        <TryIt key={`${slug}-${kind}-${size}`} ctx={ctx} size={size} k={k} brand={brand} startedAt={openedAt} />
      </View>

      <SectionLabel>Morning</SectionLabel>
      <View style={[styles.grid, { borderColor: colors.line }]}>
        {frame('Today', <TodayScreen ctx={ctx} />, { caption: 'The feel line, the strongest reason, one action: the version the brief recommends.' })}
        {frame('Today, crown down', <TodayRowsScreen ctx={ctx} />, { caption: 'Other versions, the check-in, messages, when it last synced.' })}
        {frame('Check-in 1 of 3', <CheckInScreen step={0} value={2} />, { caption: 'The crown sets 1–5; the word changes with it.' })}
        {frame('Notification', <NotificationScreen ctx={ctx} />, { caption: 'At the client’s reminder time, with two actions.', clock: null })}
        <View style={styles.cell}>
          <View style={{ padding: space[3], backgroundColor: '#3A3833', borderRadius: 16 }}>
            <Complications ctx={ctx} k={k} brand={brand} />
          </View>
          <Text variant="bodyStrong">Complications</Text>
          <Text variant="caption" color="ink2" style={{ maxWidth: 240 * k }}>
            Rectangular, circular and inline. Today’s session and feel only: no streaks or rings.
          </Text>
        </View>
      </View>

      <SectionLabel>In session</SectionLabel>
      <View style={styles.grid}>
        {plan && sBlock
          ? [
              frame('Set', <SetScreen plan={plan} b={strength} i={1} reps={setTarget(sBlock, 1).reps ?? 0} loadKg={setTarget(sBlock, 1).loadKg} bpm={DEMO_WATCH_HR.during} />, {
                caption: 'Log set logs what’s shown. The crown changes reps; tap the load to change it.',
              }),
              ...(sBlock.trackRpe ? [frame('RPE', <RpeScreen rpe={8} />, { caption: 'Only when the coach asks for RPE on this exercise.' })] : []),
              frame('Rest', <RestScreen plan={plan} step={1} secondsLeft={102} bpm={DEMO_WATCH_HR.now} />, { caption: 'Countdown, what’s next. Crown ±15 s. Taps at 0:10 and 0:00.' }),
            ]
          : null}
        {interval ? frame('Interval', <IntervalScreen block={interval} i={Math.min(1, interval.reps - 1)} working seconds={interval.workSec ? 22 : interval.distanceM && interval.distanceM >= 400 ? 251 : 38} bpm={152} />, { caption: 'Work counts down; distance work ends with Done.' }) : null}
        {station ? frame('Station', <StationScreen block={station} units={plan!.units} seconds={74} bpm={161} canUndo />, { caption: 'Race format: one big Done, then Undo for 5 seconds.' }) : null}
        {timed ? frame('Timed', <TimedScreen block={timed} working seconds={18} bpm={128} />) : null}
        {frame('Pause or end', <MenuScreen logged={Math.max(1, total - 4)} total={total} />, { caption: 'From “…”. Ending always saves what was logged.' })}
        {frame('End and save', <MenuScreen logged={Math.max(1, total - 4)} total={total} confirm />)}
        {frame('Paused', <PausedScreen name={plan?.blocks[0]?.name ?? ''} />)}
      </View>

      <SectionLabel>After the session</SectionLabel>
      <View style={styles.grid}>
        {frame('All logged', <FinishScreen logged={total} total={total} minutes={52} />)}
        {frame('Heart-rate recovery', <RecoveryScreen secondsLeft={72} peak={DEMO_WATCH_HR.peak} now={DEMO_WATCH_HR.peak - 18} shareHr={ctx.shareHr} />, {
          caption: 'Two minutes, then the session is sent. Skip any time.',
        })}
        {frame('Done', <DoneScreen title={plan?.title ?? 'Session'} logged={total} recovery={DEMO_WATCH_RECOVERY} pending={false} />, { caption: 'The tally is the only celebration. No scores.' })}
        {frame('Done, phone away', <DoneScreen title={plan?.title ?? 'Session'} logged={total} recovery={null} pending />, { caption: 'Saved on the watch; sends when the iPhone is near.' })}
      </View>

      <SectionLabel>{`${brand.coachFirst}’s messages`}</SectionLabel>
      <View style={styles.grid}>
        {frame('Messages', <MessagesScreen ctx={ctx} />)}
        {frame('Reply', <ReplyScreen ctx={ctx} />, { caption: 'One-tap replies first, then dictation.' })}
        {frame('Reply sent', <ReplyScreen ctx={ctx} sent={ctx.quickReplies[0]} />)}
      </View>

      <SectionLabel>Other days</SectionLabel>
      <View style={styles.grid}>
        {frame('Rest day', <TodayScreen ctx={{ ...ctx, day: { kind: 'rest', line: t.coach.restDayLine }, plans: [], checkedIn: false }} />)}
        {frame('Session done', <TodayScreen ctx={{ ...ctx, day: { kind: 'done', title: plan?.title ?? 'Session', sets: total }, plans: [] }} />)}
        {frame('No phone yet', <TodayScreen ctx={null} />, { caption: 'Before the iPhone app has sent anything.' })}
      </View>
    </Screen>
  );
}

/* ---------- Try it: a small interactive copy of SessionRunner (SessionRunner.swift) ---------- */

type Phase = { k: 'today' } | { k: 'ready' } | { k: 'working'; since: number } | { k: 'resting'; until: number } | { k: 'rpe' } | { k: 'complete' } | { k: 'recovery'; since: number } | { k: 'done' };
interface Sim {
  phase: Phase;
  step: number;
  reps: number;
  logged: number;
  now: number;
}
type Action = { t: 'tick'; now: number } | { t: 'start' } | { t: 'log' } | { t: 'rpe' } | { t: 'work' } | { t: 'skip' } | { t: 'crown'; d: 1 | -1 } | { t: 'finish' } | { t: 'done' } | { t: 'reset' };

function stepOf(plan: WatchSessionPlan | null, step: number) {
  const pair = plan?.order[step];
  return pair && plan ? { block: plan.blocks[pair[0]]!, b: pair[0], i: pair[1] } : null;
}

function repsAt(plan: WatchSessionPlan | null, step: number): number {
  const s = stepOf(plan, step);
  return s?.block.kind === 'strength' ? (setTarget(s.block, s.i).reps ?? 0) : 0;
}

/** Same rule as SessionRunner.entryPhase: intervals flow rep to rep, conditioning blocks into each other. */
function entry(plan: WatchSessionPlan | null, step: number, now: number): Phase {
  const s = stepOf(plan, step);
  if (!s || !plan) return { k: 'complete' };
  const prev = plan.order[step - 1]?.[0];
  if (s.block.kind === 'interval' && prev === s.b) return { k: 'working', since: now };
  if (s.block.kind === 'station' && prev != null && ['interval', 'station'].includes(plan.blocks[prev]!.kind)) return { k: 'working', since: now };
  return { k: 'ready' };
}

function makeReducer(plan: WatchSessionPlan | null) {
  const advance = (s: Sim, now: number): Sim => ({ ...s, step: s.step + 1, phase: entry(plan, s.step + 1, now), reps: repsAt(plan, s.step + 1) });
  const afterLog = (s: Sim, now: number): Sim => {
    const cur = stepOf(plan, s.step);
    const logged = { ...s, logged: s.logged + 1 };
    const rest = cur?.block.kind === 'strength' || cur?.block.kind === 'interval' ? cur.block.restSec : 0;
    return rest > 0 && s.step + 1 < (plan?.order.length ?? 0) ? { ...logged, phase: { k: 'resting', until: now + rest * 1000 } } : advance(logged, now);
  };
  return (s: Sim, a: Action): Sim => {
    const now = a.t === 'tick' ? a.now : s.now;
    const cur = stepOf(plan, s.step);
    switch (a.t) {
      case 'tick': {
        const n = { ...s, now };
        const p = s.phase;
        if (p.k === 'resting' && now >= p.until) return advance(n, now);
        if (p.k === 'working' && cur?.block.kind === 'interval' && cur.block.workSec && now - p.since >= cur.block.workSec * 1000) return afterLog(n, now);
        if (p.k === 'working' && cur?.block.kind === 'timed' && now - p.since >= cur.block.seconds * 1000) return afterLog(n, now);
        if (p.k === 'recovery' && now - p.since >= 120_000) return { ...n, phase: { k: 'done' } };
        return n;
      }
      case 'start':
        return { ...s, step: 0, logged: 0, phase: entry(plan, 0, now), reps: repsAt(plan, 0) };
      case 'log':
        return cur?.block.kind === 'strength' && cur.block.trackRpe && s.phase.k !== 'rpe' ? { ...s, phase: { k: 'rpe' } } : afterLog(s, now);
      case 'rpe':
        return afterLog(s, now);
      case 'work':
        return s.phase.k === 'working' ? afterLog(s, now) : { ...s, phase: { k: 'working', since: now } };
      case 'skip':
        return advance(s, now);
      case 'crown':
        if (s.phase.k === 'resting') return { ...s, phase: { k: 'resting', until: Math.max(now + 5000, s.phase.until + a.d * 15_000) } };
        return { ...s, reps: Math.max(0, s.reps + a.d) };
      case 'finish':
        return { ...s, phase: { k: 'recovery', since: now } };
      case 'done':
        return { ...s, phase: { k: 'done' } };
      case 'reset':
        return { ...s, phase: { k: 'today' }, step: 0, logged: 0 };
    }
  };
}

function TryIt({ ctx, size, k, brand, startedAt }: { ctx: WatchContext; size: WatchSize; k: number; brand: ReturnType<typeof watchBranding>; startedAt: number }) {
  const { colors } = useTheme();
  const plan: WatchSessionPlan | null = ctx.plans[0] ?? null;
  const reducer = useMemo(() => makeReducer(plan), [plan]);
  const [s, dispatch] = useReducer(reducer, { phase: { k: 'today' }, step: 0, reps: 0, logged: 0, now: startedAt });

  useEffect(() => {
    const id = setInterval(() => dispatch({ t: 'tick', now: Date.now() }), 500);
    return () => clearInterval(id);
  }, []);

  const cur = stepOf(plan, s.step);
  const { phase, now } = s;
  const secs = phase.k === 'working' ? (now - phase.since) / 1000 : 0;
  const crownOn = phase.k === 'resting' || (phase.k === 'ready' && cur?.block.kind === 'strength');
  let screen: ReactNode = null;
  if (phase.k === 'today' || !plan) screen = <TodayScreen ctx={ctx} onStart={() => dispatch({ t: 'start' })} />;
  else if (phase.k === 'complete') screen = <FinishScreen logged={s.logged} total={plan.order.length} minutes={Math.max(1, Math.round((now - startedAt) / 60000))} onFinish={() => dispatch({ t: 'finish' })} />;
  else if (phase.k === 'recovery')
    screen = <RecoveryScreen secondsLeft={120 - (now - phase.since) / 1000} peak={DEMO_WATCH_HR.peak} now={Math.max(110, DEMO_WATCH_HR.peak - Math.round((now - phase.since) / 2500))} shareHr={ctx.shareHr} onSkip={() => dispatch({ t: 'done' })} />;
  else if (phase.k === 'done') screen = <DoneScreen title={plan.title} logged={s.logged} recovery={DEMO_WATCH_RECOVERY} pending={false} onDone={() => dispatch({ t: 'reset' })} />;
  else if (phase.k === 'resting') screen = <RestScreen plan={plan} step={s.step} secondsLeft={(phase.until - now) / 1000} bpm={DEMO_WATCH_HR.now} onSkip={() => dispatch({ t: 'skip' })} />;
  else if (phase.k === 'rpe') screen = <RpeScreen rpe={8} onSave={() => dispatch({ t: 'rpe' })} />;
  else if (cur?.block.kind === 'strength')
    screen = <SetScreen plan={plan} b={cur.b} i={cur.i} reps={s.reps} loadKg={setTarget(cur.block, cur.i).loadKg} bpm={DEMO_WATCH_HR.during} onLog={() => dispatch({ t: 'log' })} />;
  else if (cur?.block.kind === 'interval') screen = <IntervalScreen block={cur.block} i={cur.i} working={phase.k === 'working'} seconds={secs} bpm={150} onDone={() => dispatch({ t: 'work' })} />;
  else if (cur?.block.kind === 'station') screen = <StationScreen block={cur.block} units={plan.units} seconds={secs} bpm={158} onDone={() => dispatch({ t: 'work' })} />;
  else if (cur?.block.kind === 'timed') screen = <TimedScreen block={cur.block} working={phase.k === 'working'} seconds={secs} bpm={124} onPress={() => dispatch({ t: 'work' })} />;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <WatchFrame size={size} k={k} brand={brand} label="Interactive watch">
        {screen}
      </WatchFrame>
      <View style={{ gap: space[2], alignItems: 'center' }}>
        {([1, -1] as const).map((d) => (
          <Pressable
            key={d}
            disabled={!crownOn}
            onPress={() => dispatch({ t: 'crown', d })}
            accessibilityRole="button"
            accessibilityLabel={d === 1 ? 'Turn the Digital Crown up' : 'Turn the Digital Crown down'}
            style={[styles.crown, { borderColor: colors.line, opacity: crownOn ? 1 : 0.35 }]}
          >
            <Feather name={d === 1 ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink} />
          </Pressable>
        ))}
        <Text variant="caption" color="ink2">
          Crown
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: margin - space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[2] },
  controls: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[2] },
  tryRow: { paddingHorizontal: margin, paddingVertical: space[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[5], paddingHorizontal: margin, paddingVertical: space[2] },
  cell: { gap: space[1] },
  crown: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
