import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useEventListener } from 'expo';
import { createVideoPlayer, useVideoPlayer, VideoView, type VideoPlayer as ExpoVideoPlayer, type VideoSource } from 'expo-video';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import {
  FRAME_S,
  angleDegrees,
  clock,
  sortByTime,
  visibleDrawings,
  type Annotation,
  type DrawTool,
  type DrawnAnnotation,
  type Point,
} from '@spotter/core';
import { useTheme } from '../theme';
import { haptic } from '../haptics';
import { resolveMedia } from '../mediaStore';
import { fonts, radius, space, touchMin } from '../tokens';
import { Text } from './Text';
import { Button } from './Button';
import { SegmentedControl } from './Basics';

/**
 * Video with an annotation layer (C-5 reply playback, K-5 coach review). The stage is fixed at 9:16
 * (phones record portrait) with the video contained inside, so normalised annotation points mean the
 * same thing on every screen that shows the clip.
 */

export const STAGE_ASPECT = 9 / 16;

/** A player tuned for form checks: no loop, frequent time updates for drawing sync. */
export function useFormCheckPlayer(source: VideoSource) {
  return useVideoPlayer(source, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.05;
  });
}

/**
 * A form-check player for a stored media ref ("sample", "idb:…", or a file URI). The player is created
 * once the ref resolves (null until then), rather than swapped in with replace(), which autoplays on
 * the web. `missing` is true when the ref no longer resolves (e.g. the browser's storage was cleared).
 */
export function useMediaPlayer(ref: string | null) {
  const [player, setPlayer] = useState<ExpoVideoPlayer | null>(null);
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ref) return;
    let live = true;
    let created: ExpoVideoPlayer | null = null;
    void resolveMedia(ref).then((src) => {
      if (!live) return;
      if (src == null) {
        setMissing(true);
        return;
      }
      created = createVideoPlayer(src);
      created.loop = false;
      created.timeUpdateEventInterval = 0.05;
      setMissing(false);
      setPlayer(created);
    });
    return () => {
      live = false;
      created?.release();
      setPlayer(null);
    };
  }, [ref, attempt]);
  /** Reload the source after a playback error. */
  const retry = () => setAttempt((n) => n + 1);
  return { player, missing, retry };
}

/** Current time (ms) of a player that may not exist yet; 0 until it does. */
export function usePlayerTime(player: ExpoVideoPlayer | null): number {
  const [timeMs, setTimeMs] = useState(0);
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('timeUpdate', (e) => setTimeMs(Math.round(e.currentTime * 1000)));
    return () => sub.remove();
  }, [player]);
  return player ? timeMs : 0;
}

/** Current time (ms) and status of a player, as React state. */
export function usePlayerState(player: ExpoVideoPlayer) {
  const [timeMs, setTimeMs] = useState(0);
  const [status, setStatus] = useState(player.status);
  const [playing, setPlaying] = useState(player.playing);
  useEventListener(player, 'timeUpdate', (e) => setTimeMs(Math.round(e.currentTime * 1000)));
  useEventListener(player, 'statusChange', (e) => setStatus(e.status));
  useEventListener(player, 'playingChange', (e) => setPlaying(e.isPlaying));
  return { timeMs, status, playing, durationMs: Math.round((player.duration || 0) * 1000) };
}

type StageProps = Omit<Parameters<typeof VideoStageInner>[0], 'player'> & { player: ExpoVideoPlayer | null };

const ids = new WeakMap<object, number>();
let nextId = 1;
/** Stable key per player instance, so per-player hooks reset when a new player is created. */
function playerKey(p: object): number {
  let id = ids.get(p);
  if (!id) {
    id = nextId++;
    ids.set(p, id);
  }
  return id;
}

export function VideoStage({ player, ...props }: StageProps) {
  if (!player) {
    return (
      <View
        style={[styles.stage, { backgroundColor: '#171614' }, props.maxHeight ? { width: props.maxHeight * STAGE_ASPECT, maxWidth: '100%', alignSelf: 'center' } : null]}
        accessibilityLabel={props.label}
      >
        <StageMessage icon="loader" text={props.processing ? 'This video is still processing. It’s usually ready within a minute.' : 'Loading video'} />
      </View>
    );
  }
  return <VideoStageInner key={playerKey(player)} player={player} {...props} />;
}

function VideoStageInner({
  player,
  annotations = [],
  draft,
  onPointPress,
  label,
  showNotes = true,
  onRetry,
  processing,
  maxHeight,
}: {
  player: ExpoVideoPlayer;
  annotations?: Annotation[];
  /** In-progress drawing: the tool and the points placed so far. */
  draft?: { tool: DrawTool; points: Point[] } | null;
  /** Tap-to-place for drawing tools. When set, taps on the frame add a point instead of toggling play. */
  onPointPress?: (p: Point) => void;
  label: string;
  showNotes?: boolean;
  onRetry?: () => void;
  /** The upload is still being processed: show that instead of trying to play. */
  processing?: boolean;
  /** Cap the stage height (pt) so the video, controls and tools fit on one screen. */
  maxHeight?: number;
}) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { timeMs, status } = usePlayerState(player);
  const drawings = visibleDrawings(annotations, timeMs);
  const note = showNotes
    ? sortByTime(annotations).find((a) => a.kind === 'note' && timeMs >= a.atMs && timeMs <= a.atMs + 2500)
    : undefined;
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const px = (p: Point) => ({ x: p.x * size.w, y: p.y * size.h });
  const aspect = size.h ? size.w / size.h : STAGE_ASPECT;

  return (
    <View
      style={[styles.stage, { backgroundColor: '#171614' }, maxHeight ? { width: maxHeight * STAGE_ASPECT, maxWidth: '100%', alignSelf: 'center' } : null]}
      onLayout={onLayout}
      accessibilityLabel={label}
    >
      {processing ? null : <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />}

      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          {drawings.map((d) => (
            <Drawing key={d.id} d={d} px={px} aspect={aspect} color={colors.brand} />
          ))}
          {draft ? <DraftMarks draft={draft} px={px} color={colors.brand} /> : null}
        </Svg>
      ) : null}

      {note && note.kind === 'note' ? (
        <View style={styles.caption} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text variant="callout" style={{ color: '#F1ECE2' }}>
            {note.text}
          </Text>
        </View>
      ) : null}

      {onPointPress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Place a point on the video"
          accessibilityHint="Tap where the line, angle or circle should go"
          onPress={(e) => {
            const p = localPoint(e);
            if (!size.w || !p) return;
            haptic.selection();
            onPointPress({ x: clamp01(p.x / size.w), y: clamp01(p.y / size.h) });
          }}
        />
      ) : null}

      {processing ? (
        <StageMessage icon="loader" text="This video is still processing. It’s usually ready within a minute." />
      ) : status === 'error' ? (
        <StageMessage icon="alert-circle" text="This video won’t play. Check your connection and try again." action={onRetry ? <Button label="Try again" kind="secondary" full={false} onPress={onRetry} /> : null} />
      ) : status === 'loading' || status === 'idle' ? (
        <StageMessage icon="loader" text="Loading video" />
      ) : null}
    </View>
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/**
 * Where a press landed, relative to the pressed element. Native press events carry locationX/Y;
 * react-native-web's don't, so fall back to the client position minus the element's box.
 */
export function localPoint(e: GestureResponderEvent): { x: number; y: number } | null {
  const n = e.nativeEvent as unknown as { locationX?: number; locationY?: number; clientX?: number; clientY?: number };
  if (Number.isFinite(n.locationX) && Number.isFinite(n.locationY)) return { x: n.locationX!, y: n.locationY! };
  const el = e.currentTarget as unknown as { getBoundingClientRect?: () => { left: number; top: number } };
  const rect = el?.getBoundingClientRect?.();
  if (rect && Number.isFinite(n.clientX) && Number.isFinite(n.clientY)) return { x: n.clientX! - rect.left, y: n.clientY! - rect.top };
  return null;
}

function StageMessage({ icon, text, action }: { icon: keyof typeof Feather.glyphMap; text: string; action?: ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.message]} accessibilityRole="alert">
      <Feather name={icon} size={22} color="#F1ECE2" />
      <Text variant="callout" align="center" style={{ color: '#F1ECE2' }}>
        {text}
      </Text>
      {action}
    </View>
  );
}

function Drawing({ d, px, aspect, color }: { d: DrawnAnnotation; px: (p: Point) => { x: number; y: number }; aspect: number; color: string }) {
  const sw = 3;
  if (d.kind === 'line') {
    const a = px(d.a);
    const b = px(d.b);
    return <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw} strokeLinecap="round" />;
  }
  if (d.kind === 'circle') {
    const c = px(d.center);
    const e = px(d.edge);
    return <Circle cx={c.x} cy={c.y} r={Math.hypot(e.x - c.x, e.y - c.y)} stroke={color} strokeWidth={sw} fill="none" />;
  }
  const a = px(d.a);
  const v = px(d.vertex);
  const b = px(d.b);
  const deg = angleDegrees(d.a, d.vertex, d.b, aspect);
  return (
    <>
      <Path d={`M${a.x} ${a.y} L${v.x} ${v.y} L${b.x} ${b.y}`} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={v.x} cy={v.y} r={4} fill={color} />
      {/* Dark halo first, then the label, so the degrees read over any frame. */}
      <SvgText x={v.x + 10} y={v.y - 10} fill="#171614" stroke="#171614" strokeWidth={4} fontSize={18} fontFamily={fonts.display}>
        {`${deg}°`}
      </SvgText>
      <SvgText x={v.x + 10} y={v.y - 10} fill="#F1ECE2" fontSize={18} fontFamily={fonts.display}>
        {`${deg}°`}
      </SvgText>
    </>
  );
}

function DraftMarks({ draft, px, color }: { draft: { tool: DrawTool; points: Point[] }; px: (p: Point) => { x: number; y: number }; color: string }) {
  const pts = draft.points.map(px);
  return (
    <>
      {pts.length > 1 ? (
        <Path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} stroke={color} strokeWidth={2} strokeDasharray="6 4" fill="none" />
      ) : null}
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={6} stroke={color} strokeWidth={2} fill="#F1ECE2" />
      ))}
    </>
  );
}

const SPEEDS = ['0.25', '0.5', '1'] as const;

/**
 * Transport for one or two players (compare plays both in step). Frame-step, speed, time, and a seek bar
 * that is also an adjustable control for screen readers (1 s steps).
 */
export function PlaybackControls({ players, showSpeed = true }: { players: (ExpoVideoPlayer | null)[]; showSpeed?: boolean }) {
  const ready = players.filter((p): p is ExpoVideoPlayer => p != null);
  // Wait for every player (compare plays both in step); hooks reset when the set of players changes.
  if (ready.length === 0 || ready.length !== players.length) return <ControlsPlaceholder />;
  return <PlaybackControlsInner key={ready.map(playerKey).join('-')} players={ready} showSpeed={showSpeed} />;
}

function ControlsPlaceholder() {
  const { colors } = useTheme();
  return (
    <View style={styles.controls} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.barHit}>
        <View style={[styles.bar, { backgroundColor: colors.line }]} />
      </View>
      <View style={[styles.row, { minHeight: touchMin }]} />
    </View>
  );
}

function PlaybackControlsInner({ players, showSpeed }: { players: ExpoVideoPlayer[]; showSpeed: boolean }) {
  const { colors } = useTheme();
  const lead = players[0]!;
  const { timeMs, playing, durationMs } = usePlayerState(lead);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('1');
  const [barW, setBarW] = useState(0);
  const each = (fn: (p: ExpoVideoPlayer) => void) => players.forEach(fn);
  const seekTo = (s: number) => each((p) => (p.currentTime = Math.max(0, Math.min(s, p.duration || s))));
  const step = (dir: -1 | 1) => {
    each((p) => p.pause());
    seekTo(lead.currentTime + dir * FRAME_S);
    haptic.selection();
  };
  const progress = durationMs ? Math.min(1, timeMs / durationMs) : 0;

  return (
    <View style={styles.controls}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Position"
        accessibilityValue={{ text: `${clock(timeMs)} of ${clock(durationMs)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => seekTo(lead.currentTime + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      >
        <Pressable
          onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
          onPress={(e) => {
            const p = localPoint(e);
            if (barW && p) seekTo(clamp01(p.x / barW) * (lead.duration || 0));
          }}
          style={styles.barHit}
          importantForAccessibility="no"
        >
          <View style={[styles.bar, { backgroundColor: colors.line }]}>
            <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: colors.brand }]} />
          </View>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Text variant="callout" tabular color="ink2" style={{ minWidth: 88 }}>
          {clock(timeMs)} / {clock(durationMs)}
        </Text>
        <View style={styles.buttons}>
          <TransportButton icon="chevrons-left" label="Back one frame" onPress={() => step(-1)} />
          <TransportButton
            icon={playing ? 'pause' : 'play'}
            label={playing ? 'Pause' : 'Play'}
            primary
            onPress={() => {
              if (playing) each((p) => p.pause());
              else {
                if (durationMs && timeMs >= durationMs - 100) seekTo(0);
                each((p) => p.play());
              }
            }}
          />
          <TransportButton icon="chevrons-right" label="Forward one frame" onPress={() => step(1)} />
        </View>
      </View>
      {showSpeed ? (
        <SegmentedControl
          label="Playback speed"
          value={speed}
          onChange={(v) => {
            setSpeed(v);
            each((p) => (p.playbackRate = Number(v)));
          }}
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        />
      ) : null}
    </View>
  );
}

function TransportButton({ icon, label, onPress, primary }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tbtn,
        { borderColor: colors.line, opacity: pressed ? 0.7 : 1 },
        primary && { backgroundColor: colors.ink, borderColor: colors.ink },
      ]}
    >
      <Feather name={icon} size={20} color={primary ? colors.paper : colors.ink} />
    </Pressable>
  );
}

/** Timestamped list of notes and drawings; tapping one seeks every player to it. */
export function AnnotationList({
  annotations,
  onSeek,
  onRemove,
}: {
  annotations: Annotation[];
  onSeek: (ms: number) => void;
  onRemove?: (id: string) => void;
}) {
  const { colors } = useTheme();
  const items = sortByTime(annotations.filter((a) => a.kind !== 'voice'));
  if (!items.length) return null;
  const describe = (a: Annotation) => {
    switch (a.kind) {
      case 'note':
        return a.text;
      case 'line':
        return 'Line';
      case 'circle':
        return 'Circle';
      case 'angle':
        return `Angle ${angleDegrees(a.a, a.vertex, a.b, STAGE_ASPECT)}°`;
      case 'voice':
        return 'Voice-over';
    }
  };
  return (
    <View>
      {items.map((a) => (
        <View key={a.id} style={[styles.annRow, { borderBottomColor: colors.line }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${clock(a.atMs)}: ${describe(a)}`}
            onPress={() => onSeek(a.atMs)}
            style={styles.annMain}
          >
            <View style={[styles.stamp, { borderColor: colors.line }]}>
              <Text variant="label" tabular>
                {clock(a.atMs)}
              </Text>
            </View>
            <Text style={{ flex: 1 }}>{describe(a)}</Text>
          </Pressable>
          {onRemove ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${describe(a)}`} onPress={() => onRemove(a.id)} style={styles.remove} hitSlop={6}>
              <Feather name="x" size={18} color={colors.ink2} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: STAGE_ASPECT, borderRadius: radius.sheet, overflow: 'hidden' },
  caption: { position: 'absolute', left: space[3], right: space[3], bottom: space[3], backgroundColor: 'rgba(23,22,20,0.82)', borderRadius: radius.control, padding: space[2] },
  message: { alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6], backgroundColor: 'rgba(23,22,20,0.72)' },
  controls: { gap: space[3] },
  barHit: { minHeight: touchMin, justifyContent: 'center' },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  buttons: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: space[2] },
  tbtn: { width: touchMin, height: touchMin, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  annRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  annMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingVertical: space[2] },
  stamp: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  remove: { width: touchMin, height: touchMin, alignItems: 'center', justifyContent: 'center' },
});
