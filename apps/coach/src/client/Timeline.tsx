import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import {
  SHORT_SLEEP_HOURS,
  UNDER_FUELLED_SHARE,
  dayDetail,
  laneSummaries,
  usualSleep,
  type ClientDay,
  type CyclePhase,
} from '@spotter/core';
import { SegmentedControl, Skeleton, Text, fonts, useTheme, margin, space } from '@spotter/ui';

/*
 * The client's timeline (docs/ux/coach-experience.md): 4 or 8 weeks, one column per day, every lane on the
 * same day axis so a short night lines up with the session after it. Each lane has its own scale (no dual
 * axes) and its own one-line summary, which is also the text alternative. Tap any lane to read that day.
 *
 * Colour jobs: ink for what happened, brand only for the days that matter (short night, HRV well under
 * usual), amber for under-fuelled and pain. Every coloured mark also has a word in the day detail and the
 * lane summary, so nothing is colour-only.
 */

const PHASE_SHORT: Record<CyclePhase, string> = {
  menstrual: 'Period',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};
const PHASE_OPACITY: Record<CyclePhase, number> = {
  menstrual: 0.7,
  follicular: 0.1,
  ovulation: 0.45,
  luteal: 0.25,
};

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export function Timeline({
  days: all,
  first,
  healthVisible,
  loading,
  empty,
}: {
  days: ClientDay[];
  first: string;
  healthVisible: boolean;
  loading?: boolean;
  empty?: ReactNode;
}) {
  const { colors } = useTheme();
  const [weeks, setWeeks] = useState<'4' | '8'>('8');
  const [width, setWidth] = useState(0);
  const days = useMemo(() => all.slice(-Number(weeks) * 7), [all, weeks]);
  const [sel, setSel] = useState<number | null>(null);
  const selected = sel == null ? days.length - 1 : Math.min(sel, days.length - 1);
  const n = days.length;
  const col = n ? width / n : 0;
  const s = useMemo(() => laneSummaries(days), [days]);
  const usual = useMemo(() => usualSleep(all), [all]);

  if (loading) {
    return (
      <View style={styles.wrap}>
        <Skeleton height={180} />
      </View>
    );
  }
  if (!n || (!days.some((d) => d.training.sessions.length) && !s.sleep && !s.hrv && !s.food)) {
    return <View style={styles.wrap}>{empty}</View>;
  }

  const pick = (e: GestureResponderEvent) => {
    if (!col) return;
    const i = Math.max(0, Math.min(n - 1, Math.floor(e.nativeEvent.locationX / col)));
    setSel(i);
  };
  const x = (i: number) => i * col;
  const barW = Math.max(2, col - 2);
  const mondays = days.map((d, i) => (weekday(d.date) === 1 ? i : -1)).filter((i) => i > 0);

  const strip = (h: number, children: ReactNode, label: string) => (
    <View
      style={{ height: h }}
      accessible
      accessibilityLabel={label}
      onStartShouldSetResponder={() => true}
      onResponderRelease={pick}
    >
      {width ? (
        <Svg width={width} height={h} pointerEvents="none">
          {mondays.map((i) => (
            <Line key={i} x1={x(i)} x2={x(i)} y1={0} y2={h} stroke={colors.line} strokeWidth={1} />
          ))}
          {children}
          <Rect
            x={x(selected)}
            y={0}
            width={Math.max(col, 2)}
            height={h}
            fill={colors.ink}
            opacity={0.08}
          />
        </Svg>
      ) : null}
    </View>
  );

  // Training: load per day (minutes × effort). Spotter sessions filled; imported ones outlined.
  const maxLoad = Math.max(1, ...days.map((d) => d.training.load));
  const TH = 44;
  const training = days.map((d, i) => {
    let y = TH;
    return d.training.sessions.map((t, k) => {
      const h = Math.max(3, (t.load / maxLoad) * (TH - 4));
      y -= h;
      const r = (
        <Rect
          key={`${i}-${k}`}
          x={x(i) + 1}
          y={y}
          width={barW}
          height={h - (k > 0 ? 1 : 0)}
          rx={Math.min(2, barW / 2)}
          fill={t.source === 'imported' ? 'transparent' : colors.ink}
          stroke={t.source === 'imported' ? colors.ink : 'none'}
          strokeWidth={t.source === 'imported' ? 1 : 0}
        />
      );
      return r;
    });
  });

  // Sleep: bars against a fixed 4–10 h scale; the client's usual night as a dashed line.
  const SH = 36;
  const sy = (h: number) => SH - ((Math.max(4, Math.min(10, h)) - 4) / 6) * (SH - 2);
  // HRV: above or below their own usual (1.0), ±30% to the edges.
  const HH = 36;
  const hy = (r: number) => HH / 2 - Math.max(-1, Math.min(1, (r - 1) / 0.3)) * (HH / 2 - 2);
  // Food: share of the calorie target, 0–130%, with the 100% line.
  const FH = 28;
  const fy = (v: number) => FH - (Math.min(1.3, v) / 1.3) * (FH - 2);

  const cycleRuns: { start: number; end: number; phase: CyclePhase }[] = [];
  days.forEach((d, i) => {
    const p = d.cycle?.phase ?? null;
    const last = cycleRuns[cycleRuns.length - 1];
    if (!p) return;
    if (last && last.phase === p && last.end === i - 1) last.end = i;
    else cycleRuns.push({ start: i, end: i, phase: p });
  });

  const lane = (title: string, summary: string | null, chart: ReactNode, after?: ReactNode) => (
    <View style={styles.lane}>
      <View style={styles.laneHead}>
        <Text variant="label" color="ink2">
          {title}
        </Text>
        {summary ? (
          <Text variant="caption" color="ink2" style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
      </View>
      {chart}
      {after}
    </View>
  );

  const d = days[selected]!;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {`Last ${weeks} weeks`}
        </Text>
        <View style={{ width: 132 }}>
          <SegmentedControl
            label="Weeks shown"
            value={weeks}
            onChange={(v) => {
              setWeeks(v);
              setSel(null);
            }}
            options={[
              { value: '4', label: '4 wk' },
              { value: '8', label: '8 wk' },
            ]}
          />
        </View>
      </View>
      <Text variant="caption" color="ink2">
        {healthVisible
          ? 'Tap any day to see it. Thin lines mark each Monday.'
          : `Training only. What ${first} shares about sleep, recovery and food stays with their coach.`}
      </Text>

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ gap: space[3], marginTop: space[2] }}
      >
        {lane(
          'Training',
          s.training,
          strip(
            TH,
            <>
              {training}
              <Line
                x1={0}
                x2={width}
                y1={TH - 0.5}
                y2={TH - 0.5}
                stroke={colors.line}
                strokeWidth={1}
              />
            </>,
            `Training: ${s.training}. Filled bars are sessions logged in Spotter, outlined bars are workouts from other apps; taller means more minutes times effort.`,
          ),
        )}
        {healthVisible && s.sleep
          ? lane(
              'Sleep',
              s.sleep,
              strip(
                SH,
                <>
                  {days.map((dd, i) =>
                    dd.recovery.sleepHours != null ? (
                      <Rect
                        key={i}
                        x={x(i) + 1}
                        y={sy(dd.recovery.sleepHours)}
                        width={barW}
                        height={SH - sy(dd.recovery.sleepHours)}
                        rx={Math.min(2, barW / 2)}
                        fill={
                          dd.recovery.sleepHours < SHORT_SLEEP_HOURS ? colors.brand : colors.ink2
                        }
                        opacity={dd.recovery.sleepHours < SHORT_SLEEP_HOURS ? 1 : 0.45}
                      />
                    ) : null,
                  )}
                  {usual != null ? (
                    <Line
                      x1={0}
                      x2={width}
                      y1={sy(usual)}
                      y2={sy(usual)}
                      stroke={colors.ink}
                      strokeWidth={1}
                      strokeDasharray="3,3"
                    />
                  ) : null}
                </>,
                `Sleep: ${s.sleep}. Short nights, under ${SHORT_SLEEP_HOURS} hours, are highlighted; the dashed line is ${first}'s usual night.`,
              ),
            )
          : null}
        {healthVisible && s.hrv
          ? lane(
              'HRV vs their usual',
              s.hrv,
              strip(
                HH,
                <>
                  <Line
                    x1={0}
                    x2={width}
                    y1={HH / 2}
                    y2={HH / 2}
                    stroke={colors.ink2}
                    strokeWidth={1}
                    opacity={0.6}
                  />
                  {days.map((dd, i) => {
                    const r = dd.recovery.hrvVsBaseline;
                    if (r == null) return null;
                    const y = hy(r);
                    const top = Math.min(y, HH / 2);
                    return (
                      <Rect
                        key={i}
                        x={x(i) + 1}
                        y={top}
                        width={barW}
                        height={Math.max(1.5, Math.abs(y - HH / 2))}
                        rx={Math.min(1.5, barW / 2)}
                        fill={dd.recovery.hrvLow ? colors.brand : colors.ink2}
                        opacity={dd.recovery.hrvLow ? 1 : 0.5}
                      />
                    );
                  })}
                </>,
                `HRV against ${first}'s own usual: ${s.hrv}. Bars above the line are over their usual, below are under; days well under usual are highlighted.`,
              ),
            )
          : null}
        {healthVisible && s.mobility
          ? lane(
              'Mobility',
              s.mobility,
              strip(
                10,
                <>
                  {days.map((dd, i) =>
                    dd.mobility.sessions ? (
                      <Rect
                        key={i}
                        x={x(i) + 1}
                        y={1}
                        width={barW}
                        height={8}
                        rx={Math.min(2, barW / 2)}
                        fill={colors.ink2}
                      />
                    ) : null,
                  )}
                </>,
                `Mobility: ${s.mobility}.`,
              ),
            )
          : null}
        {healthVisible && s.food
          ? lane(
              'Food vs target',
              s.food,
              strip(
                FH,
                <>
                  <Line
                    x1={0}
                    x2={width}
                    y1={fy(1)}
                    y2={fy(1)}
                    stroke={colors.ink}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  {days.map((dd, i) => {
                    const v = dd.nutrition.vsTarget;
                    if (v == null) return null;
                    const under = v < UNDER_FUELLED_SHARE;
                    return (
                      <Rect
                        key={i}
                        x={x(i) + 1}
                        y={fy(v)}
                        width={barW}
                        height={FH - fy(v)}
                        rx={Math.min(2, barW / 2)}
                        fill={under ? colors.warning : colors.ink2}
                        opacity={under ? 1 : 0.45}
                      />
                    );
                  })}
                </>,
                `Food against the calorie target: ${s.food}. The dashed line is the target; days under 75% are highlighted.`,
              ),
            )
          : null}
        {healthVisible && s.cycle
          ? lane(
              'Cycle (shared)',
              'estimated phases',
              strip(
                14,
                <>
                  {cycleRuns.map((r) => (
                    <Rect
                      key={r.start}
                      x={x(r.start)}
                      y={1}
                      width={(r.end - r.start + 1) * col - 1}
                      height={12}
                      rx={3}
                      fill={colors.ink}
                      opacity={PHASE_OPACITY[r.phase]}
                    />
                  ))}
                  {cycleRuns.map((r) =>
                    (r.end - r.start + 1) * col >= 14 ? (
                      <SvgText
                        key={`l${r.start}`}
                        x={x(r.start) + 4}
                        y={11}
                        fontSize={9}
                        fontFamily={fonts.semibold}
                        fill={r.phase === 'menstrual' ? colors.paper : colors.ink}
                      >
                        {PHASE_SHORT[r.phase][0]}
                      </SvgText>
                    ) : null,
                  )}
                </>,
                `Cycle phases ${first} shares, estimated: ${cycleRuns.map((r) => `${PHASE_SHORT[r.phase]} from ${shortDate(days[r.start]!.date)}`).join(', ')}.`,
              ),
              <View
                style={styles.legend}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {(['menstrual', 'follicular', 'ovulation', 'luteal'] as CyclePhase[]).map((p) => (
                  <View key={p} style={styles.legendItem}>
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: colors.ink, opacity: PHASE_OPACITY[p] },
                      ]}
                    />
                    <Text variant="caption" color="ink2">
                      {`${PHASE_SHORT[p][0]} ${PHASE_SHORT[p]}`}
                    </Text>
                  </View>
                ))}
              </View>,
            )
          : null}
        {healthVisible && s.pain
          ? lane(
              'Pain',
              s.pain,
              strip(
                14,
                <>
                  {days.map((dd, i) =>
                    dd.pain.length ? (
                      <Circle
                        key={i}
                        cx={x(i) + col / 2}
                        cy={7}
                        r={Math.max(
                          1.5,
                          Math.min(
                            5,
                            col / 2 - 0.5,
                            2 + Math.max(...dd.pain.map((p) => p.level)) / 2.5,
                          ),
                        )}
                        fill={colors.warning}
                      />
                    ) : null,
                  )}
                </>,
                `Pain: ${s.pain}.`,
              ),
            )
          : null}
        <View style={styles.axis}>
          <Text variant="caption" color="ink2">
            {shortDate(days[0]!.date)}
          </Text>
          <Text variant="caption" color="ink2">
            Today
          </Text>
        </View>
      </View>

      <View
        style={[styles.detail, { borderColor: colors.line, backgroundColor: colors.surface }]}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.detailHead}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            disabled={selected === 0}
            onPress={() => setSel(selected - 1)}
            style={[styles.step, { opacity: selected === 0 ? 0.3 : 1 }]}
          >
            <Feather name="chevron-left" size={20} color={colors.ink} />
          </Pressable>
          <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }}>
            {selected === n - 1 ? `Today · ${dayLabel(d.date)}` : dayLabel(d.date)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            disabled={selected === n - 1}
            onPress={() => setSel(selected + 1)}
            style={[styles.step, { opacity: selected === n - 1 ? 0.3 : 1 }]}
          >
            <Feather name="chevron-right" size={20} color={colors.ink} />
          </Pressable>
        </View>
        {(healthVisible
          ? dayDetail(d)
          : dayDetail({
              ...d,
              recovery: {
                sleepHours: null,
                hrvMs: null,
                restingHr: null,
                hrvVsBaseline: null,
                rhrVsBaseline: null,
                hrvLow: null,
              },
              mobility: { minutes: 0, sessions: 0 },
              nutrition: { kcal: null, proteinG: null, carbsG: null, vsTarget: null, source: null },
              cycle: null,
              pain: [],
              check: null,
            })
        ).map((l, i) => (
          <Text key={i} variant="callout">
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: margin, paddingTop: space[6], gap: space[1] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  lane: { gap: 4 },
  laneHead: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  summary: { flex: 1, textAlign: 'right' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 14, height: 10, borderRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -space[2] },
  detail: {
    marginTop: space[3],
    padding: space[3],
    paddingTop: space[1],
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: 2,
  },
  detailHead: { flexDirection: 'row', alignItems: 'center' },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
