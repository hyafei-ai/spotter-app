import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import {
  TOOL_POINTS,
  buildDrawing,
  clock,
  previousOfSameLift,
  uuidv7,
  type Annotation,
  type DrawTool,
  type FormCheck,
  type Point,
} from '@spotter/core';
import {
  AnnotationList,
  Button,
  EmptyState,
  IconButton,
  PlaybackControls,
  Screen,
  SectionLabel,
  Text,
  TextField,
  VideoStage,
  VoiceOver,
  keepMedia,
  useMediaPlayer,
  usePlayerTime,
  useTheme,
  useToast,
  margin,
  radius,
  space,
  touchMin,
} from '@spotter/ui';
import { useCoach } from '../../../src/store';
import { useMedia, withReply } from '../../../src/media/store';

type Tool = DrawTool | 'note' | null;

const TOOL_HINT: Record<DrawTool, string> = {
  line: 'Tap two points on the video: where the line starts and ends.',
  angle: 'Tap three points: one end, the joint, then the other end. The angle is shown in degrees.',
  circle: 'Tap the centre, then a point on the edge.',
};

/** K-5 form-check review: draw, comment and record over the client's video, then send. */
export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loaded, load, formChecks, replies } = useMedia();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/clients'));
  const raw = formChecks.find((c) => c.id === id);

  if (!loaded) return <Screen>{null}</Screen>;
  if (!raw) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={back} />
        </View>
        <EmptyState message="This form check isn’t available any more." actionLabel="Back to clients" onAction={() => router.replace('/clients')} />
      </Screen>
    );
  }
  const check = withReply(raw, replies);
  const previous = previousOfSameLift(
    formChecks.map((c) => withReply(c, replies)),
    check,
  );
  return <Editor key={check.id} check={check} previous={previous} back={back} />;
}

function Editor({ check, previous, back }: { check: FormCheck; previous: FormCheck | null; back: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { height } = useWindowDimensions();
  const sendReply = useMedia((s) => s.sendReply);
  const client = useCoach((s) => s.clients.find((c) => c.id === check.clientId));
  const firstName = client?.name.split(' ')[0] ?? 'the client';
  const replied = check.upload.status === 'replied';
  const processing = check.upload.status === 'processing' || check.upload.status === 'uploading' || check.upload.status === 'queued';

  const [annotations, setAnnotations] = useState<Annotation[]>(check.annotations);
  const [summary, setSummary] = useState(check.replySummary ?? '');
  const [tool, setTool] = useState<Tool>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [noteText, setNoteText] = useState('');
  const [compare, setCompare] = useState(false);
  const [sending, setSending] = useState(false);

  const main = useMediaPlayer(check.videoUri);
  const other = useMediaPlayer(compare && previous ? previous.videoUri : null);
  const timeMs = usePlayerTime(main.player);
  const players = compare ? [main.player, other.player] : [main.player];
  const voice = annotations.find((a) => a.kind === 'voice');

  const chooseTool = (t: Tool) => {
    main.player?.pause();
    setPoints([]);
    setTool((cur) => (cur === t ? null : t));
  };

  const place = (p: Point) => {
    if (!tool || tool === 'note') return;
    const next = [...points, p];
    if (next.length >= TOOL_POINTS[tool]) {
      const d = buildDrawing(tool, next, timeMs, uuidv7());
      if (d) setAnnotations((a) => [...a, d]);
      setPoints([]);
      setTool(null);
    } else setPoints(next);
  };

  const addNote = () => {
    const text = noteText.trim();
    if (!text) return;
    setAnnotations((a) => [...a, { id: uuidv7(), atMs: timeMs, kind: 'note', text }]);
    setNoteText('');
    setTool(null);
  };

  const seek = (ms: number) =>
    players.forEach((p) => {
      if (p) p.currentTime = ms / 1000;
    });
  const canSend = annotations.length > 0 || summary.trim().length > 0;

  const send = async () => {
    setSending(true);
    await sendReply(check, annotations, summary.trim() || null);
    toast({ message: `Feedback sent to ${firstName}` });
    back();
  };

  return (
    <Screen
      footer={
        replied ? undefined : (
          <Button
            label="Send feedback"
            icon="send"
            onPress={() => void send()}
            loading={sending}
            disabled={!canSend || processing}
            disabledReason={processing ? 'The video is still processing.' : 'Add a note, drawing or voice-over first.'}
          />
        )
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {check.exerciseName}
        </Text>
        <Text color="ink2">
          {[client?.name, check.setLabel, new Date(check.createdAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {check.upload.status === 'replied' ? (
          <Text variant="callout" style={{ color: colors.brand }}>
            Feedback sent {new Date(check.upload.repliedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </Text>
        ) : null}
      </View>

      {check.clientNote ? (
        <View style={[styles.quote, { borderLeftColor: colors.line }]}>
          <Text variant="label" color="ink2">
            {firstName}’s note
          </Text>
          <Text variant="callout">{check.clientNote}</Text>
        </View>
      ) : null}

      {/* Drawing tools sit directly above the video so the frame stays in view while placing points. */}
      {!replied && !compare ? (
        <>
          <View style={styles.tools} accessibilityRole="toolbar">
            {(['note', 'line', 'angle', 'circle'] as const).map((t) => (
              <ToolButton key={t} tool={t} active={tool === t} onPress={() => chooseTool(t)} />
            ))}
          </View>
          {tool && tool !== 'note' ? (
            <View style={styles.hint}>
              <Text variant="callout" color="ink2" style={{ flex: 1 }}>
                {TOOL_HINT[tool]} {points.length ? `(${points.length} of ${TOOL_POINTS[tool]})` : ''}
              </Text>
              <Button label="Cancel" kind="quiet" full={false} onPress={() => chooseTool(null)} />
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.body}>
        {compare && previous ? (
          <View style={styles.compare}>
            <View style={{ flex: 1, gap: space[1] }}>
              <Text variant="label" color="ink2">
                {new Date(previous.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </Text>
              <VideoStage player={other.player} annotations={previous.annotations} label="Earlier video" showNotes={false} />
            </View>
            <View style={{ flex: 1, gap: space[1] }}>
              <Text variant="label" color="ink2">
                This one
              </Text>
              <VideoStage player={main.player} annotations={annotations} label="This video" showNotes={false} />
            </View>
          </View>
        ) : main.missing ? (
          <EmptyState message="This video isn’t available on this device." />
        ) : (
          <VideoStage
            player={main.player}
            annotations={annotations}
            draft={tool && tool !== 'note' ? { tool, points } : null}
            onPointPress={tool && tool !== 'note' && !replied ? place : undefined}
            label={`${firstName}’s video of ${check.exerciseName}`}
            processing={processing}
            onRetry={main.retry}
            maxHeight={Math.round(height * 0.55)}
          />
        )}
        <PlaybackControls players={players} />
        {previous ? (
          <Button
            label={compare ? 'Show this video only' : `Compare with ${new Date(previous.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
            kind="secondary"
            icon="columns"
            onPress={() => {
              setTool(null);
              setCompare((c) => !c);
            }}
          />
        ) : null}
      </View>

      {!replied && !compare ? (
        <>
          {tool === 'note' ? (
            <View style={styles.body}>
              <TextField label={`Note at ${clock(timeMs)}`} value={noteText} onChangeText={setNoteText} multiline placeholder="e.g. Knees drift in here" autoFocus />
              <Button label={`Add note at ${clock(timeMs)}`} kind="secondary" onPress={addNote} disabled={!noteText.trim()} />
            </View>
          ) : null}
          <View style={styles.body}>
            <VoiceRecorder
              existing={voice && voice.kind === 'voice' ? voice : null}
              onRecorded={(v) => setAnnotations((a) => [...a.filter((x) => x.kind !== 'voice'), { id: uuidv7(), atMs: 0, kind: 'voice', uri: v.uri, durationMs: v.durationMs }])}
              onRemove={() => setAnnotations((a) => a.filter((x) => x.kind !== 'voice'))}
            />
          </View>
        </>
      ) : replied && voice && voice.kind === 'voice' ? (
        <View style={styles.body}>
          <VoiceOver mediaRef={voice.uri} durationMs={voice.durationMs} label="Your voice-over" />
        </View>
      ) : null}

      {annotations.some((a) => a.kind !== 'voice') ? <SectionLabel>On the video</SectionLabel> : null}
      <AnnotationList annotations={annotations} onSeek={seek} onRemove={replied ? undefined : (aid) => setAnnotations((a) => a.filter((x) => x.id !== aid))} />

      <View style={styles.body}>
        {replied ? (
          check.replySummary ? (
            <Text>{check.replySummary}</Text>
          ) : null
        ) : (
          <TextField label={`Summary for ${firstName} (optional)`} value={summary} onChangeText={setSummary} multiline placeholder="The one thing to work on next session" />
        )}
      </View>
    </Screen>
  );
}

const TOOL_LABEL = { note: 'Note', line: 'Line', angle: 'Angle', circle: 'Circle' } as const;
const TOOL_ICON = { note: 'message-square', line: 'minus', angle: 'chevron-up', circle: 'circle' } as const;

function ToolButton({ tool, active, onPress }: { tool: keyof typeof TOOL_LABEL; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${TOOL_LABEL[tool]} tool`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tool, { borderColor: active ? colors.ink : colors.line, backgroundColor: active ? colors.ink : 'transparent' }]}
    >
      <Feather name={TOOL_ICON[tool]} size={18} color={active ? colors.paper : colors.ink} />
      <Text variant="bodyStrong" style={{ color: active ? colors.paper : colors.ink }}>
        {TOOL_LABEL[tool]}
      </Text>
    </Pressable>
  );
}

function VoiceRecorder({
  existing,
  onRecorded,
  onRemove,
}: {
  existing: { uri: string; durationMs: number } | null;
  onRecorded: (v: { uri: string; durationMs: number }) => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      setDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setDenied(true);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    const durationMs = Math.round(state.durationMillis);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    if (recorder.uri) {
      const id = uuidv7();
      const ref = await keepMedia(id, recorder.uri, Platform.OS === 'web' ? 'webm' : 'm4a');
      onRecorded({ uri: ref, durationMs });
    }
  };

  if (existing && !state.isRecording) {
    return (
      <View style={{ gap: space[2] }}>
        <VoiceOver mediaRef={existing.uri} durationMs={existing.durationMs} label="Your voice-over" />
        <Button label="Remove voice-over" kind="quiet" full={false} onPress={onRemove} />
      </View>
    );
  }

  return (
    <View style={{ gap: space[2] }}>
      {state.isRecording ? (
        <View style={[styles.rec, { borderColor: colors.error }]} accessibilityLiveRegion="polite">
          <Feather name="mic" size={18} color={colors.error} />
          <Text variant="bodyStrong" tabular style={{ flex: 1 }}>
            Recording {clock(state.durationMillis)}
          </Text>
          <Button label="Stop" kind="secondary" full={false} onPress={() => void stop()} />
        </View>
      ) : (
        <Button label="Record a voice-over" kind="secondary" icon="mic" onPress={() => void start()} loading={busy} />
      )}
      {denied ? (
        <Text variant="caption" color="ink2">
          Spotter Coach can’t use the microphone. Turn it on in Settings → Spotter Coach → Microphone, or write a note instead.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[3] },
  quote: { marginHorizontal: margin, marginTop: space[3], borderLeftWidth: 3, paddingLeft: space[3], gap: 2 },
  compare: { flexDirection: 'row', gap: space[2] },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingHorizontal: margin, paddingTop: space[3] },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: margin, paddingTop: space[2] },
  tool: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchMin, paddingHorizontal: space[3], borderWidth: 1, borderRadius: radius.control },
  rec: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderWidth: 1.5, borderRadius: radius.control },
});
