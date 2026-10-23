import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, Text as RNText, type TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import {
  CHECK_IN_WORDS,
  hrRecoveryLine,
  type StrengthSet,
  type WatchBlock,
  type WatchBranding,
  type WatchContext,
  type WatchHrRecovery,
  type WatchSessionPlan,
} from '@spotter/core';
import { fonts } from '@spotter/ui';

/**
 * The watch app's screens drawn in React Native for the web preview (docs/ux/watch.md). Each component mirrors
 * a SwiftUI view in apps/client/watch/SpotterWatch with the same content, order and hierarchy; sizes are watch
 * points × the preview scale. Words use Source Sans here; on the watch they're the system font (SF Compact).
 */

/** Watch screen sizes in points (Apple Watch Series 41/45 mm, Ultra 49 mm). */
export const WATCH_SIZES = {
  41: { w: 176, h: 215, r: 34 },
  45: { w: 198, h: 242, r: 38 },
  49: { w: 205, h: 251, r: 40 },
} as const;
export type WatchSize = keyof typeof WATCH_SIZES;

/** Art-direction dark tokens: the watch is always dark (same as AppGroup.swift `Ink`). */
export const INK = {
  paper: '#171614',
  surface: '#211F1C',
  ink: '#F1ECE2',
  ink2: '#A8A296',
  line: '#34312C',
  success: '#6FBF83',
  warning: '#E0B04A',
  error: '#F2867E',
};

interface Watch {
  k: number;
  size: WatchSize;
  brand: WatchBranding;
}
const WatchCtx = createContext<Watch>({ k: 1, size: 45, brand: { appName: '', coachName: '', coachFirst: '', monogram: '', accent: '#F07A3E', accentInk: '#1C1B18' } });
const useW = () => useContext(WatchCtx);

/* ---------- frame and primitives ---------- */

export function WatchFrame({ size, k, brand, label, children, clock = '10:09' }: { size: WatchSize; k: number; brand: WatchBranding; label: string; children: ReactNode; clock?: string | null }) {
  const s = WATCH_SIZES[size];
  return (
    <WatchCtx.Provider value={{ k, size, brand }}>
      <View
        style={[styles.bezel, { width: (s.w + 16) * k, height: (s.h + 16) * k, borderRadius: (s.r + 8) * k, padding: 8 * k }]}
        accessibilityRole="image"
        accessibilityLabel={label}
      >
        <View style={[styles.screen, { width: s.w * k, height: s.h * k, borderRadius: s.r * k }]}>
          {clock ? <RNText style={[styles.clock, { fontSize: 13 * k, top: 6 * k, right: 14 * k }]}>{clock}</RNText> : null}
          <View style={{ flex: 1, paddingHorizontal: 10 * k, paddingTop: 22 * k, paddingBottom: 8 * k }}>{children}</View>
        </View>
      </View>
    </WatchCtx.Provider>
  );
}

function T({ children, size, color = INK.ink, weight = 'regular', figure, lines, style }: { children: ReactNode; size: number; color?: string; weight?: 'regular' | 'semibold'; figure?: boolean; lines?: number; style?: TextStyle }) {
  const { k } = useW();
  return (
    <RNText
      numberOfLines={lines}
      style={[
        { color, fontSize: size * k, lineHeight: size * k * (figure ? 1.0 : 1.22), fontFamily: figure ? fonts.display : weight === 'semibold' ? fonts.semibold : fonts.regular },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

/** The one primary action: bottom, full width, the trainer's accent fill (PrimaryButton in Components.swift). */
function Primary({ title, onPress, tall }: { title: string; onPress?: () => void; tall?: boolean }) {
  const { k, brand } = useW();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{ backgroundColor: brand.accent, borderRadius: 22 * k, minHeight: (tall ? 64 : 40) * k, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 * k, marginTop: 'auto' }}
    >
      <RNText numberOfLines={2} style={{ color: brand.accentInk, fontFamily: fonts.semibold, fontSize: 15 * k, lineHeight: 18 * k, textAlign: 'center' }}>
        {title}
      </RNText>
    </Pressable>
  );
}

function Quiet({ title, onPress, color = INK.ink2, icon }: { title: string; onPress?: () => void; color?: string; icon?: 'corner-up-left' }) {
  const { k } = useW();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 * k, minHeight: 28 * k }}>
      {icon ? <Feather name={icon} size={12 * k} color={color} /> : null}
      <T size={13} color={color}>
        {title}
      </T>
    </Pressable>
  );
}

/** Live HR, small and top right (HeartRateBadge). */
function Hr({ bpm }: { bpm: number | null }) {
  const { k } = useW();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 * k }} accessibilityLabel={bpm ? `Heart rate ${bpm} beats per minute` : 'Heart rate not available'}>
      <Feather name="heart" size={10 * k} color={INK.ink2} />
      <T size={18} figure>
        {bpm ?? '—'}
      </T>
      <T size={10} color={INK.ink2}>
        bpm
      </T>
    </View>
  );
}

/** Step title (full width, under the system clock), then the detail line with live HR on its right (StepHeader). */
function Head({ title, bpm, sub }: { title: string; bpm?: number | null; sub?: string }) {
  return (
    <View>
      <T size={16} weight="semibold" lines={1}>
        {title}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
        <View style={{ flex: 1 }}>
          {sub ? (
            <T size={13} color={INK.ink2} lines={1}>
              {sub}
            </T>
          ) : null}
        </View>
        {bpm !== undefined ? <Hr bpm={bpm} /> : null}
      </View>
    </View>
  );
}

/** The chalk strike under the feel line (StrikeLine). */
function Strike() {
  const { k, brand } = useW();
  return (
    <Svg width={64 * k} height={7 * k} viewBox="0 0 64 7" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M1 5.5 Q 32 3.8 63 1.6" stroke={brand.accent} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** The tally on Done (Tally in Components.swift): groups of five. */
function Tally({ count }: { count: number }) {
  const { k, brand } = useW();
  const groups = Math.max(1, Math.ceil(count / 5));
  return (
    <View style={{ flexDirection: 'row', gap: 6 * k, flexWrap: 'wrap' }} accessibilityLabel={`${count} logged`}>
      {Array.from({ length: groups }, (_, g) => {
        const n = Math.min(5, count - g * 5);
        const marks = Array.from({ length: Math.min(4, n) }, (_, i) => `M${3 + i * 6} 2 L${2 + i * 6} 20`).join(' ');
        return (
          <Svg key={g} width={26 * k} height={22 * k} viewBox="0 0 26 22">
            <Path d={`${marks}${n === 5 ? ' M0 18 L26 4' : ''}`} stroke={brand.accent} strokeWidth={2.5} strokeLinecap="round" fill="none" />
          </Svg>
        );
      })}
    </View>
  );
}

function Hairline() {
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: INK.line }} />;
}

function Row({ title, detail }: { title: string; detail?: string | null }) {
  const { k } = useW();
  return (
    <View style={{ minHeight: 40 * k, justifyContent: 'center' }}>
      <Hairline />
      <View style={{ paddingVertical: 5 * k }}>
        <T size={15}>{title}</T>
        {detail ? (
          <T size={12} color={INK.ink2} lines={1}>
            {detail}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/* ---------- formatting (Fmt in Components.swift) ---------- */

export const fmtLoad = (kg: number | null, units: string) => {
  if (kg == null) return '';
  const v = units === 'lb' ? kg * 2.20462 : kg;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}`;
};
export const clock = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const dist = (m: number) => (m >= 1000 ? `${m % 1000 === 0 ? m / 1000 : (m / 1000).toFixed(1)} km` : `${m} m`);
const pace = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;

/* ---------- W1 Today ---------- */

export function TodayScreen({ ctx, date = 'Fri 23 Oct', onStart }: { ctx: WatchContext | null; date?: string; onStart?: () => void }) {
  const { k, brand } = useW();
  return (
    <View style={{ flex: 1, gap: 4 * k }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * k }}>
        <View style={{ width: 22 * k, height: 22 * k, borderRadius: 11 * k, backgroundColor: brand.accent, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Coached by ${brand.coachName}`}>
          <T size={12} figure color={brand.accentInk}>
            {brand.monogram}
          </T>
        </View>
        <T size={12} color={INK.ink2}>
          {date}
        </T>
      </View>
      {!ctx ? (
        <T size={15}>{`Open ${brand.appName} on your iPhone once to bring today’s plan here.`}</T>
      ) : (
        <>
          {ctx.brief ? (
            <View>
              <T size={27} figure lines={3}>
                {ctx.brief.feel}
              </T>
              {ctx.brief.strike ? <Strike /> : null}
              {ctx.brief.reason ? (
                <T size={12} color={INK.ink2} lines={2}>
                  {ctx.brief.reason}
                </T>
              ) : null}
            </View>
          ) : null}
          {ctx.day.kind === 'done' ? (
            <View style={{ gap: 2 * k, marginTop: 'auto' }}>
              <Tally count={ctx.day.sets} />
              <T size={14}>{`${ctx.day.title} done · ${ctx.day.sets} logged`}</T>
            </View>
          ) : ctx.day.kind === 'rest' || ctx.day.kind === 'no_program' ? (
            <>
              <T size={14} lines={3}>
                {ctx.day.line}
              </T>
              {!ctx.checkedIn ? <Primary title="How do you feel?" /> : null}
            </>
          ) : ctx.plans[0] ? (
            <Primary title={`Start ${ctx.plans[0].label}`} onPress={onStart} />
          ) : null}
        </>
      )}
    </View>
  );
}

/** Today scrolled down with the crown: the secondary rows. */
export function TodayRowsScreen({ ctx }: { ctx: WatchContext }) {
  const { brand } = useW();
  const coach = ctx.messages.filter((m) => m.from === 'coach').at(-1);
  return (
    <View style={{ flex: 1 }}>
      {ctx.plans.slice(1).map((p) => (
        <Row key={p.planId} title={p.label} detail={p.version === 'planned' ? `As ${brand.coachFirst} planned it` : null} />
      ))}
      {!ctx.checkedIn ? <Row title="How do you feel?" detail="3 taps" /> : null}
      <Row title={brand.coachFirst || 'Messages'} detail={coach?.body ?? 'No messages yet'} />
      <Hairline />
      <T size={12} color={INK.ink2} style={{ marginTop: 6 }}>
        {`Last synced ${new Date(ctx.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
      </T>
    </View>
  );
}

/* ---------- W2 Check-in ---------- */

const QUESTIONS = ['Energy', 'Soreness', 'Stress'] as const;
const WORDS: readonly (readonly string[])[] = [CHECK_IN_WORDS.energy, CHECK_IN_WORDS.soreness, CHECK_IN_WORDS.stress];

export function CheckInScreen({ step, value, onNext }: { step: 0 | 1 | 2; value: number; onNext?: () => void }) {
  const { k } = useW();
  return (
    <View style={{ flex: 1, gap: 2 * k }}>
      <T size={12} color={INK.ink2}>{`${step + 1} of 3`}</T>
      <T size={16} weight="semibold">
        {QUESTIONS[step]}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 * k }} accessibilityLabel={`${QUESTIONS[step]} ${value} of 5, ${WORDS[step]?.[value - 1] ?? ""}`}>
        <T size={56} figure>
          {value}
        </T>
        <T size={14} color={INK.ink2}>
          {WORDS[step]?.[value - 1]}
        </T>
      </View>
      <Primary title={step < 2 ? 'Next' : 'Save'} onPress={onNext} />
    </View>
  );
}

/* ---------- W3 Set, RPE ---------- */

export function setTarget(block: Extract<WatchBlock, { kind: 'strength' }>, i: number): StrengthSet {
  return block.sets[Math.min(i, block.sets.length - 1)]!;
}

export function SetScreen({ plan, b, i, reps, loadKg, bpm, focus = 'reps', onLog }: { plan: WatchSessionPlan; b: number; i: number; reps: number; loadKg: number | null; bpm: number | null; focus?: 'reps' | 'load'; onLog?: () => void }) {
  const { k, brand } = useW();
  const block = plan.blocks[b] as Extract<WatchBlock, { kind: 'strength' }>;
  const target = setTarget(block, i);
  const weighted = block.metric === 'weight_reps' && target.loadKg != null;
  const num = (text: string, unit: string, on: boolean) => (
    <View style={{ borderBottomWidth: on ? 2 * k : 0, borderBottomColor: brand.accent, paddingBottom: 1 * k }}>
      <T size={on ? 50 : 38} figure>
        {text}
      </T>
      <T size={10} color={on ? INK.ink : INK.ink2}>
        {unit}
      </T>
    </View>
  );
  return (
    <View style={{ flex: 1, gap: 1 * k }}>
      <Head title={block.name} bpm={bpm} sub={`${block.group ? `${block.group} · ` : ''}Set ${i + 1} of ${block.sets.length}`} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 * k }} accessibilityLabel={weighted ? `${fmtLoad(loadKg, plan.units)} ${plan.units}, ${reps} reps` : `${reps} reps`}>
        {weighted ? (
          <>
            {num(fmtLoad(loadKg, plan.units), plan.units, focus === 'load')}
            <T size={26} figure color={INK.ink2} style={{ marginBottom: 14 * k }}>
              ×
            </T>
          </>
        ) : null}
        {num(target.reps == null && reps === 0 ? 'Max' : String(reps), 'reps', focus === 'reps')}
      </View>
      {target.rpe != null ? <T size={12} color={INK.ink2}>{`RPE ${target.rpe}`}</T> : null}
      {plan.calibration && i === 0 ? (
        <T size={10} color={INK.ink2} lines={2}>
          {plan.calibration}
        </T>
      ) : null}
      <Primary title="Log set" onPress={onLog} />
    </View>
  );
}

const rpeWords = (v: number) => (v >= 10 ? 'Nothing left' : v >= 9 ? '1 left in the tank' : v >= 8 ? '2 left in the tank' : v >= 7 ? '3 left in the tank' : '4 or more left');

export function RpeScreen({ rpe, onSave }: { rpe: number; onSave?: () => void }) {
  const { k } = useW();
  return (
    <View style={{ flex: 1, gap: 2 * k }}>
      <T size={16} weight="semibold">
        How hard was it?
      </T>
      <T size={56} figure>
        {rpe}
      </T>
      <T size={12} color={INK.ink2}>
        {rpeWords(rpe)}
      </T>
      <Primary title="Save" onPress={onSave} />
      <View style={{ alignItems: 'center', marginTop: 4 * k }}>
        <Quiet title="Skip" onPress={onSave} />
      </View>
    </View>
  );
}

/* ---------- W4 Rest ---------- */

export function nextLine(plan: WatchSessionPlan, step: number): string {
  const pair = plan.order[step + 1];
  if (!pair) return 'Finish';
  const [b, i] = pair;
  const block = plan.blocks[b]!;
  switch (block.kind) {
    case 'strength': {
      const s = setTarget(block, i);
      const parts = [s.loadKg != null ? `${fmtLoad(s.loadKg, plan.units)} ${plan.units}` : null, s.reps != null ? `× ${s.reps}` : null].filter(Boolean).join(' ');
      return `${block.name} · set ${i + 1} · ${parts}`;
    }
    case 'interval':
      return `${block.name} · ${i + 1} of ${block.reps}`;
    case 'station':
      return block.name;
    case 'timed':
      return `${block.name} · ${clock(block.seconds)}`;
  }
}

export function RestScreen({ plan, step, secondsLeft, bpm, canUndo, onSkip }: { plan: WatchSessionPlan; step: number; secondsLeft: number; bpm: number | null; canUndo?: boolean; onSkip?: () => void }) {
  const { k } = useW();
  return (
    <View style={{ flex: 1, gap: 1 * k }}>
      <Head title="Rest" bpm={bpm} />
      <T size={62} figure>
        {clock(secondsLeft)}
      </T>
      <T size={12} color={INK.ink2} lines={2}>{`Next: ${nextLine(plan, step)}`}</T>
      {canUndo ? <Quiet title="Undo last" icon="corner-up-left" /> : null}
      <Primary title="Skip rest" onPress={onSkip} />
    </View>
  );
}

/* ---------- W5 Interval, W6 Station, W7 Timed ---------- */

export function IntervalScreen({ block, i, working, seconds, bpm, onDone }: { block: Extract<WatchBlock, { kind: 'interval' }>; i: number; working: boolean; seconds: number; bpm: number | null; onDone?: () => void }) {
  const { k } = useW();
  const target =
    block.target?.kind === 'pace'
      ? `Target ${pace(block.target.secPerKm)}`
      : block.target?.kind === 'hr_zone'
        ? `Target zone ${block.target.zone}`
        : block.target?.kind === 'watts'
          ? `Target ${block.target.watts} W`
          : block.target?.kind === 'rpe'
            ? `Target RPE ${block.target.rpe}`
            : null;
  const line = [block.workSec == null && block.distanceM ? dist(block.distanceM) : null, target].filter(Boolean).join(' · ');
  const big = block.workSec != null ? clock(working ? block.workSec - seconds : block.workSec) : working ? clock(seconds) : dist(block.distanceM ?? 0);
  return (
    <View style={{ flex: 1, gap: 1 * k }}>
      <Head title={block.name} bpm={bpm} sub={`${working ? 'Work' : 'Ready'} · ${i + 1} of ${block.reps}`} />
      <T size={58} figure>
        {big}
      </T>
      {line ? <T size={12} color={INK.ink2}>{line}</T> : null}
      {!working ? <Primary title="Start" onPress={onDone} /> : block.workSec == null ? <Primary title="Done" onPress={onDone} /> : null}
    </View>
  );
}

export function StationScreen({ block, units, seconds, bpm, canUndo, onDone }: { block: Extract<WatchBlock, { kind: 'station' }>; units: string; seconds: number; bpm: number | null; canUndo?: boolean; onDone?: () => void }) {
  const { k } = useW();
  const spec = [block.distanceM ? dist(block.distanceM) : null, block.reps ? `${block.reps} reps` : null, block.loadKg != null ? `${fmtLoad(block.loadKg, units)} ${units}` : null].filter(Boolean).join(' · ');
  return (
    <View style={{ flex: 1, gap: 1 * k }}>
      <Head title={block.name} bpm={bpm} sub={spec} />
      <T size={54} figure>
        {clock(seconds)}
      </T>
      {canUndo ? <Quiet title="Undo last" icon="corner-up-left" /> : null}
      <Primary title="Done" tall onPress={onDone} />
    </View>
  );
}

export function TimedScreen({ block, working, seconds, bpm, onPress }: { block: Extract<WatchBlock, { kind: 'timed' }>; working: boolean; seconds: number; bpm: number | null; onPress?: () => void }) {
  const { k } = useW();
  return (
    <View style={{ flex: 1, gap: 1 * k }}>
      <Head title={block.name} bpm={bpm} sub={working ? 'Hold' : 'Ready'} />
      <T size={58} figure>
        {clock(working ? block.seconds - seconds : block.seconds)}
      </T>
      <Primary title={working ? 'Done early' : 'Start'} onPress={onPress} />
    </View>
  );
}

/* ---------- menu, finish, recovery, done ---------- */

export function MenuScreen({ logged, total, confirm }: { logged: number; total: number; confirm?: boolean }) {
  const { k } = useW();
  if (confirm) {
    return (
      <View style={{ flex: 1, gap: 6 * k, justifyContent: 'center' }}>
        <T size={16} weight="semibold" style={{ textAlign: 'center' }}>{`End and save ${logged} of ${total}?`}</T>
        <Primary title="End and save" />
        <View style={{ alignItems: 'center' }}>
          <Quiet title="Keep going" />
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, gap: 8 * k, justifyContent: 'center' }}>
      <Primary title="Pause" />
      <View style={{ borderWidth: 1, borderColor: INK.line, borderRadius: 20 * k, minHeight: 40 * k, alignItems: 'center', justifyContent: 'center' }}>
        <T size={15} color={INK.error}>
          End session
        </T>
      </View>
    </View>
  );
}

export function FinishScreen({ logged, total, minutes, onFinish }: { logged: number; total: number; minutes: number; onFinish?: () => void }) {
  const { k } = useW();
  return (
    <View style={{ flex: 1, gap: 2 * k }}>
      <T size={36} figure>
        All logged
      </T>
      <T size={14} color={INK.ink2}>{`${logged} of ${total} · ${minutes} min`}</T>
      <Primary title="Finish" onPress={onFinish} />
    </View>
  );
}

export function RecoveryScreen({ secondsLeft, peak, now, shareHr, onSkip }: { secondsLeft: number; peak: number; now: number | null; shareHr: boolean; onSkip?: () => void }) {
  const { k, brand } = useW();
  return (
    <View style={{ flex: 1, gap: 1 * k }}>
      <T size={16} weight="semibold">
        Keep still
      </T>
      <T size={54} figure>
        {clock(secondsLeft)}
      </T>
      <T size={12} color={INK.ink2}>{`Peak ${peak} · now ${now ?? '—'}`}</T>
      <T size={10} color={INK.ink2} lines={2}>
        {shareHr ? `Shows ${brand.coachFirst} how you’re recovering` : 'Measuring how fast your heart rate comes down'}
      </T>
      <Primary title="Skip" onPress={onSkip} />
    </View>
  );
}

export function DoneScreen({ title, logged, recovery, pending, onDone }: { title: string; logged: number; recovery: WatchHrRecovery | null; pending: boolean; onDone?: () => void }) {
  const { k, brand } = useW();
  const line = hrRecoveryLine(recovery);
  return (
    <View style={{ flex: 1, gap: 3 * k }}>
      <Tally count={logged} />
      <T size={15} weight="semibold">{`${title} · ${logged} logged`}</T>
      {line ? <T size={13}>{line}</T> : <T size={12} color={INK.ink2}>No heart rate this time. Saved without it.</T>}
      <View style={{ flexDirection: 'row', gap: 4 * k, alignItems: 'center' }}>
        <Feather name={pending ? 'clock' : 'check'} size={11 * k} color={pending ? INK.warning : INK.success} />
        <T size={11} color={pending ? INK.warning : INK.success} lines={2} style={{ flex: 1 }}>
          {pending ? 'Saved on your watch · sends when your iPhone is near' : `Sent to ${brand.coachFirst}`}
        </T>
      </View>
      <Primary title="Done" onPress={onDone} />
    </View>
  );
}

export function PausedScreen({ name }: { name: string }) {
  const { k } = useW();
  return (
    <View style={{ flex: 1, gap: 2 * k }}>
      <T size={40} figure>
        Paused
      </T>
      <T size={14} color={INK.ink2}>
        {name}
      </T>
      <Primary title="Resume" />
    </View>
  );
}

/* ---------- W11 Messages ---------- */

export function MessagesScreen({ ctx }: { ctx: WatchContext }) {
  const { k, brand } = useW();
  const list = [...ctx.messages].reverse().slice(0, 3);
  return (
    <View style={{ flex: 1, gap: 4 * k }}>
      <T size={16} weight="semibold">
        {brand.coachFirst}
      </T>
      {list.length === 0 ? <T size={14} color={INK.ink2}>{`${brand.coachFirst} hasn’t written yet.`}</T> : null}
      {list.map((m) => (
        <View key={m.id} style={{ backgroundColor: INK.surface, borderRadius: 12 * k, padding: 6 * k }}>
          <T size={11} color={INK.ink2}>
            {m.from === 'coach' ? brand.coachFirst : 'You'}
          </T>
          <T size={14} lines={3}>
            {m.body}
          </T>
        </View>
      ))}
    </View>
  );
}

export function ReplyScreen({ ctx, sent }: { ctx: WatchContext; sent?: string }) {
  const { k } = useW();
  const coach = ctx.messages.filter((m) => m.from === 'coach').at(-1);
  if (sent) {
    return (
      <View style={{ flex: 1, gap: 4 * k }}>
        <T size={14} lines={4}>
          {coach?.body ?? ''}
        </T>
        <View style={{ flexDirection: 'row', gap: 4 * k, alignItems: 'center' }}>
          <Feather name="check" size={12 * k} color={INK.success} />
          <T size={13} color={INK.success}>
            Sent
          </T>
        </View>
        <T size={12} color={INK.ink2}>{`“${sent}”`}</T>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, gap: 4 * k }}>
      <T size={13} lines={3}>
        {coach?.body ?? ''}
      </T>
      {ctx.quickReplies.slice(0, 2).map((r) => (
        <View key={r} style={{ backgroundColor: INK.surface, borderRadius: 18 * k, minHeight: 34 * k, justifyContent: 'center', paddingHorizontal: 10 * k }}>
          <T size={14}>{r}</T>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 * k, minHeight: 30 * k }}>
        <Feather name="mic" size={13 * k} color={INK.ink} />
        <T size={14}>Dictate</T>
      </View>
    </View>
  );
}

/* ---------- complications and notification ---------- */

export function Complications({ ctx, k, brand }: { ctx: WatchContext; k: number; brand: WatchBranding }) {
  const plan = ctx.plans[0];
  const session = ctx.day.kind === 'session' ? (plan?.label ?? '') : ctx.day.kind === 'done' ? `${ctx.day.title} · done` : ctx.day.kind === 'rest' ? 'Rest day' : brand.appName;
  const word = ctx.day.kind === 'session' ? 'Train' : ctx.day.kind === 'done' ? 'Done' : ctx.day.kind === 'rest' ? 'Rest' : '';
  const box = { backgroundColor: '#000', borderRadius: 10 * k, padding: 8 * k };
  return (
    <View style={{ gap: 10 * k }}>
      <View style={[box, { width: 180 * k }]} accessibilityLabel={`Rectangular complication: ${ctx.brief?.glance ?? ''}, ${session}`}>
        <RNText style={{ color: brand.accent, fontFamily: fonts.semibold, fontSize: 15 * k }} numberOfLines={1}>
          {ctx.brief?.glance ?? session}
        </RNText>
        <RNText style={{ color: '#fff', fontFamily: fonts.regular, fontSize: 13 * k }} numberOfLines={1}>
          {session}
        </RNText>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 * k, alignItems: 'center' }}>
        <View style={{ width: 52 * k, height: 52 * k, borderRadius: 26 * k, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Circular complication: ${session}`}>
          <RNText style={{ color: brand.accent, fontFamily: fonts.display, fontSize: 17 * k }}>{brand.monogram}</RNText>
          <RNText style={{ color: '#fff', fontSize: 10 * k, fontFamily: fonts.regular }}>{word}</RNText>
        </View>
        <View style={[box, { flex: 1 }]} accessibilityLabel={`Inline complication: ${session}`}>
          <RNText style={{ color: '#fff', fontFamily: fonts.regular, fontSize: 13 * k }} numberOfLines={1}>
            {session}
          </RNText>
        </View>
      </View>
    </View>
  );
}

export function NotificationScreen({ ctx }: { ctx: WatchContext }) {
  const { k, brand } = useW();
  const lighter = ctx.plans.find((p) => p.version === 'lighter');
  const body = ctx.brief?.action.kind === 'start' && ctx.brief.action.version === 'lighter' && lighter ? `${brand.coachFirst} set an easier ${ctx.plans[0]?.title ?? ''}` : `${ctx.plans[0]?.title ?? 'Today'} as planned`;
  return (
    <View style={{ flex: 1, gap: 3 * k }}>
      <View style={{ width: 22 * k, height: 22 * k, borderRadius: 11 * k, backgroundColor: brand.accent, alignItems: 'center', justifyContent: 'center' }}>
        <T size={11} figure color={brand.accentInk}>
          {brand.monogram}
        </T>
      </View>
      <T size={22} figure lines={2}>
        {ctx.brief?.feel ?? ''}
      </T>
      <T size={13} color={INK.ink2}>
        {body}
      </T>
      <View style={{ backgroundColor: INK.surface, borderRadius: 18 * k, minHeight: 30 * k, justifyContent: 'center', alignItems: 'center', marginTop: 'auto' }}>
        <T size={14}>Easier version</T>
      </View>
      <View style={{ backgroundColor: INK.surface, borderRadius: 18 * k, minHeight: 30 * k, justifyContent: 'center', alignItems: 'center' }}>
        <T size={14}>As planned</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bezel: { backgroundColor: '#0B0B0A', borderWidth: 1, borderColor: '#3A3833' },
  screen: { backgroundColor: INK.paper, overflow: 'hidden' },
  clock: { position: 'absolute', color: INK.ink, fontFamily: fonts.semibold },
});
