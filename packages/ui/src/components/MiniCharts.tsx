import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * Small, honest charts for the client app (docs/ux/client-experience.md: "data drawn, not described").
 * Rules: one series per chart, no legend box (the card title names it), thin marks with rounded data ends,
 * recessive reference lines, text in ink tokens. Every chart takes `label`, a plain-sentence text alternative
 * for screen readers, and is hidden from assistive tech otherwise. Meaning is never colour-only: the screen
 * always says it in words next to the chart.
 */

function useWidth(initial = 300): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(40, Math.round(e.nativeEvent.layout.width)))];
}

function Frame({ label, height, onLayout, children }: { label: string; height: number; onLayout: (e: LayoutChangeEvent) => void; children: ReactNode }) {
  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }} accessible accessibilityRole="image" accessibilityLabel={label} role="img">
      {children}
    </View>
  );
}

/** Rounded-top bar anchored to the baseline (4px data end). */
function barPath(x: number, w: number, top: number, bottom: number): string {
  const h = Math.max(0, bottom - top);
  const r = Math.min(4, w / 2, h);
  return `M${x} ${bottom} L${x} ${top + r} Q${x} ${top} ${x + r} ${top} L${x + w - r} ${top} Q${x + w} ${top} ${x + w} ${top + r} L${x + w} ${bottom} Z`;
}

/**
 * Vertical bars, oldest left, with an optional reference line (the person's own usual). `emphasis` picks
 * bars drawn in the brand colour (e.g. the latest night); the rest are muted ink. Null values leave a gap
 * with a short tick so a missing night reads as missing, not zero.
 */
export function MiniBars({
  values,
  label,
  reference,
  max,
  emphasis,
  height = 64,
}: {
  values: (number | null)[];
  label: string;
  reference?: number | null;
  max?: number;
  emphasis?: (i: number, v: number) => boolean;
  height?: number;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const n = Math.max(1, values.length);
  const top = Math.max(max ?? 0, reference ?? 0, ...values.map((v) => v ?? 0), 1);
  const gap = 2;
  const bw = Math.max(3, Math.min(28, (width - gap * (n - 1)) / n));
  const span = bw * n + gap * (n - 1);
  const x0 = width - span;
  const pad = 4;
  const y = (v: number) => height - (v / top) * (height - pad);
  return (
    <Frame label={label} height={height} onLayout={onLayout}>
      <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={colors.line} strokeWidth={1} />
        {values.map((v, i) => {
          const x = x0 + i * (bw + gap);
          if (v == null) return <Rect key={i} x={x} y={height - 3} width={bw} height={1.5} fill={colors.line} />;
          return <Path key={i} d={barPath(x, bw, y(v), height - 1)} fill={emphasis?.(i, v) ? colors.brand : colors.ink2} opacity={emphasis?.(i, v) ? 1 : 0.45} />;
        })}
        {reference != null ? (
          <Line x1={0} x2={width} y1={y(reference)} y2={y(reference)} stroke={colors.ink} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.75} />
        ) : null}
      </Svg>
    </Frame>
  );
}

/**
 * A line over time with the person's usual range as a band behind it. The last point is marked.
 * Values are plotted between the band and the data's own extremes so small changes stay visible.
 */
export function MiniSpark({
  values,
  label,
  band,
  height = 56,
}: {
  values: (number | null)[];
  label: string;
  band?: [number, number] | null;
  height?: number;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  const all = [...pts.map((p) => p.v), ...(band ?? [])];
  const lo = Math.min(...all, Infinity);
  const hi = Math.max(...all, -Infinity);
  const pad = (hi - lo || 1) * 0.15;
  const ymin = lo - pad;
  const ymax = hi + pad;
  const r = 4;
  const x = (i: number) => r + (i / Math.max(1, values.length - 1)) * (width - r * 2);
  const y = (v: number) => r + (1 - (v - ymin) / (ymax - ymin || 1)) * (height - r * 2);
  let d = '';
  let prev = -2;
  for (const p of pts) {
    d += `${p.i === prev + 1 ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)} `;
    prev = p.i;
  }
  const last = pts[pts.length - 1];
  return (
    <Frame label={label} height={height} onLayout={onLayout}>
      {pts.length ? (
        <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {band ? <Rect x={0} y={y(band[1])} width={width} height={Math.max(1, y(band[0]) - y(band[1]))} fill={colors.line} opacity={0.7} rx={3} /> : null}
          <Path d={d} stroke={colors.ink} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {last ? <Circle cx={x(last.i)} cy={y(last.v)} r={r} fill={colors.brand} stroke={colors.surface} strokeWidth={2} /> : null}
        </Svg>
      ) : null}
    </Frame>
  );
}

export interface RingSegment {
  /** First and last day of the segment, 1-based. */
  from: number;
  to: number;
  /** Drawn darker: the phase today falls in, for example. */
  strong?: boolean;
}

/**
 * A cycle as a ring: segments for phases, today marked with a dot and a tick. Phase names are written next
 * to the ring by the caller; colour only repeats them.
 */
export function MiniRing({ length, day, segments, label, size = 92, center }: { length: number; day: number | null; segments: RingSegment[]; label: string; size?: number; center?: ReactNode }) {
  const { colors } = useTheme();
  const stroke = 9;
  const rad = size / 2 - stroke / 2 - 3;
  const c = size / 2;
  const at = (dayPos: number) => {
    const a = (dayPos / length) * Math.PI * 2 - Math.PI / 2;
    return { x: c + rad * Math.cos(a), y: c + rad * Math.sin(a) };
  };
  const arc = (from: number, to: number) => {
    const s = at(from - 1 + 0.15);
    const e = at(to - 0.15);
    const large = to - from + 1 > length / 2 ? 1 : 0;
    return `M${s.x.toFixed(2)} ${s.y.toFixed(2)} A${rad} ${rad} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };
  const today = day != null ? at(Math.min(length, day) - 0.5) : null;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={label} role="img">
      <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Circle cx={c} cy={c} r={rad} stroke={colors.line} strokeWidth={stroke} fill="none" opacity={0.6} />
        <G>
          {segments.map((s, i) => (
            <Path key={i} d={arc(s.from, s.to)} stroke={s.strong ? colors.ink : colors.ink2} opacity={s.strong ? 0.9 : 0.35} strokeWidth={stroke} strokeLinecap="round" fill="none" />
          ))}
        </G>
        {today ? <Circle cx={today.x} cy={today.y} r={stroke / 2 + 2.5} fill={colors.brand} stroke={colors.surface} strokeWidth={2.5} /> : null}
      </Svg>
      {center ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>{center}</View> : null}
    </View>
  );
}

/**
 * One value against a need: a filled track to `value`, with labelled ticks (e.g. "need"). The caller says
 * the result in words; the meter only shows how far.
 */
export function MiniMeter({ value, max, ticks = [], label, height = 14 }: { value: number; max: number; ticks?: number[]; label: string; height?: number }) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const x = (v: number) => Math.max(0, Math.min(width, (v / (max || 1)) * width));
  const h = height;
  return (
    <Frame label={label} height={h + 6} onLayout={onLayout}>
      <Svg width={width} height={h + 6} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Rect x={0} y={3} width={width} height={h} rx={h / 2} fill={colors.line} opacity={0.7} />
        <Rect x={0} y={3} width={Math.max(h, x(value))} height={h} rx={h / 2} fill={colors.ink2} />
        {ticks.map((t) => (
          <Line key={t} x1={x(t)} x2={x(t)} y1={0} y2={h + 6} stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
        ))}
      </Svg>
    </Frame>
  );
}

/** The chalk-strike under a word in display type: a short hand-drawn stroke, static (the animated one is for sets). */
export function StrikeUnder({ width = '100%' }: { width?: number | `${number}%` }) {
  const { colors } = useTheme();
  return (
    <Svg width={width} height={10} viewBox="0 0 100 10" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M2 6.5 C 18 4.6, 34 6.4, 52 5.1 S 84 3.6, 98 4.4" stroke={colors.strike} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.95} />
    </Svg>
  );
}
