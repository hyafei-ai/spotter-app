import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { MAX_FORM_CHECK_S, checkDuration, clock, type ProgramExercise } from '@spotter/core';
import { LOWER_A } from '@spotter/core/demo';
import {
  Button,
  IconButton,
  ListRow,
  PlaybackControls,
  Screen,
  Sheet,
  Text,
  TextField,
  VideoStage,
  useFormCheckPlayer,
  usePlayerState,
  useTheme,
  margin,
  space,
} from '@spotter/ui';
import { SyncBanner } from '../../src/SyncBanner';
import { resultText } from '../../src/format';
import { tenant } from '../../src/env';
import { useApp } from '../../src/store';
import { useFormChecks } from '../../src/formchecks/store';

type Phase =
  | { kind: 'choose' }
  | { kind: 'denied'; what: 'camera' | 'library' }
  | { kind: 'too_long'; seconds: number }
  | { kind: 'review'; uri: string; durationMs: number; sizeBytes: number; contentType: string };

/** C-5: record (up to 60 s) or pick a video of a set and send it to the coach. */
export default function NewFormCheck() {
  const params = useLocalSearchParams<{ pe?: string; set?: string }>();
  const { colors } = useTheme();
  const active = useApp((s) => s.active);
  const create = useFormChecks((s) => s.create);
  const plan = active?.plan ?? LOWER_A;
  const first = tenant.coach.name.split(' ')[0];

  const [exercise, setExercise] = useState<ProgramExercise | null>(() => plan.exercises.find((e) => e.id === params.pe) ?? null);
  const [choosing, setChoosing] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const setIndex = params.set != null && params.set !== '' ? Number(params.set) : null;

  const setLabel = useMemo(() => {
    if (setIndex == null || !exercise) return null;
    const logged = active?.sets.find((s) => s.programExerciseId === exercise.id && s.setIndex === setIndex);
    return logged ? `Set ${setIndex + 1} · ${resultText(exercise, logged)}` : `Set ${setIndex + 1}`;
  }, [setIndex, exercise, active?.sets]);

  const accept = (a: ImagePicker.ImagePickerAsset) => {
    const durationMs = a.duration ?? 0;
    const check = checkDuration(durationMs);
    if (!check.ok && check.reason === 'too_long') return setPhase({ kind: 'too_long', seconds: check.seconds });
    setPhase({
      kind: 'review',
      uri: a.uri,
      // Some web pickers don't report a length; the server checks it again after upload.
      durationMs: durationMs || 1,
      sizeBytes: a.fileSize ?? 1,
      contentType: a.mimeType ?? 'video/mp4',
    });
  };

  // Permissions are asked at the moment of use (C-5).
  const record = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setPhase({ kind: 'denied', what: 'camera' });
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: MAX_FORM_CHECK_S, quality: 0.7 });
    if (!res.canceled && res.assets[0]) accept(res.assets[0]);
  };
  const pick = async () => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return setPhase({ kind: 'denied', what: 'library' });
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
    if (!res.canceled && res.assets[0]) accept(res.assets[0]);
  };

  const send = async () => {
    if (phase.kind !== 'review' || !exercise) return;
    setSending(true);
    const c = await create({
      exerciseId: exercise.exerciseId,
      exerciseName: active?.swaps[exercise.id]?.name ?? exercise.name,
      programExerciseId: exercise.id,
      sessionId: active?.sessionId ?? null,
      setIndex,
      setLabel,
      uri: phase.uri,
      durationMs: phase.durationMs,
      sizeBytes: phase.sizeBytes,
      contentType: phase.contentType,
      clientNote: note.trim() || null,
    });
    router.replace(`/form-check/${c.id}`);
  };

  const measured = useCallback((ms: number) => {
    const check = checkDuration(ms);
    if (!check.ok && check.reason === 'too_long') setPhase({ kind: 'too_long', seconds: check.seconds });
    else setPhase((p) => (p.kind === 'review' && p.durationMs !== ms ? { ...p, durationMs: ms } : p));
  }, []);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/coach'));

  return (
    <Screen
      banner={<SyncBanner />}
      footer={
        phase.kind === 'review' ? (
          <Button
            label="Send to coach"
            icon="send"
            onPress={() => void send()}
            loading={sending}
            disabled={!exercise}
            disabledReason={!exercise ? 'Pick which lift this is.' : undefined}
          />
        ) : undefined
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Form check
        </Text>
        <Text color="ink2">
          {first} replies on the video with notes and drawings. Film from the side with your whole body in frame, up to {MAX_FORM_CHECK_S} seconds.
        </Text>
      </View>

      <ListRow
        title={exercise ? (active?.swaps[exercise.id]?.name ?? exercise.name) : 'Which lift?'}
        subtitle={exercise ? (setLabel ?? 'No set attached') : 'Pick the exercise this video is of'}
        chevron
        onPress={() => setChoosing(true)}
        last
      />

      {phase.kind === 'choose' ? (
        <View style={styles.actions}>
          {Platform.OS === 'web' ? (
            <Button label="Record a set" kind="secondary" icon="video" disabled disabledReason="Recording works in the app. In the browser, pick a video instead." />
          ) : (
            <Button label="Record a set" icon="video" onPress={() => void record()} />
          )}
          <Button label="Pick from library" kind={Platform.OS === 'web' ? 'primary' : 'secondary'} icon="film" onPress={() => void pick()} />
        </View>
      ) : null}

      {phase.kind === 'denied' ? (
        <View style={[styles.notice, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]} accessibilityRole="alert">
          <Feather name="lock" size={18} color={colors.warning} />
          <View style={{ flex: 1, gap: space[3] }}>
            <Text>
              {phase.what === 'camera'
                ? `${tenant.appName} can’t use the camera. Turn it on in Settings → ${tenant.appName} → Camera.`
                : `${tenant.appName} can’t see your videos. Turn on access in Settings → ${tenant.appName} → Photos.`}
            </Text>
            <Button label="Open Settings" kind="secondary" full={false} onPress={() => void Linking.openSettings()} />
            {phase.what === 'camera' ? <Button label="Pick from library" kind="quiet" full={false} onPress={() => void pick()} /> : null}
          </View>
        </View>
      ) : null}

      {phase.kind === 'too_long' ? (
        <View style={[styles.notice, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]} accessibilityRole="alert">
          <Feather name="scissors" size={18} color={colors.warning} />
          <View style={{ flex: 1, gap: space[3] }}>
            <Text>
              This video is {clock(phase.seconds * 1000)}. Form checks can be up to {MAX_FORM_CHECK_S} seconds. Trim it in Photos, or record just the set.
            </Text>
            <Button label="Pick another video" kind="secondary" full={false} onPress={() => void pick()} />
            {Platform.OS !== 'web' ? <Button label="Record instead" kind="quiet" full={false} onPress={() => void record()} /> : null}
          </View>
        </View>
      ) : null}

      {phase.kind === 'review' ? (
        <Review uri={phase.uri} note={note} onNote={setNote} onRetake={() => setPhase({ kind: 'choose' })} onMeasured={measured} />
      ) : null}

      <Sheet visible={choosing} title="Which lift?" onClose={() => setChoosing(false)}>
        {plan.exercises.map((e, i) => (
          <ListRow
            key={e.id}
            title={active?.swaps[e.id]?.name ?? e.name}
            right={exercise?.id === e.id ? <Feather name="check" size={20} color={colors.brand} /> : undefined}
            last={i === plan.exercises.length - 1}
            onPress={() => {
              setExercise(e);
              setChoosing(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

function Review({
  uri,
  note,
  onNote,
  onRetake,
  onMeasured,
}: {
  uri: string;
  note: string;
  onNote: (s: string) => void;
  onRetake: () => void;
  onMeasured: (durationMs: number) => void;
}) {
  const player = useFormCheckPlayer(uri);
  const { durationMs } = usePlayerState(player);
  const { height } = useWindowDimensions();
  useEffect(() => () => player.pause(), [player]);
  // The real length, once the player has loaded it (pickers on the web don't always report one).
  useEffect(() => {
    if (durationMs > 0) onMeasured(durationMs);
  }, [durationMs, onMeasured]);
  return (
    <View style={styles.review}>
      <VideoStage player={player} label="Your video" maxHeight={Math.round(height * 0.5)} />
      <PlaybackControls players={[player]} showSpeed={false} />
      <TextField label="Note for your coach (optional)" value={note} onChangeText={onNote} multiline placeholder="What felt off, or what you want checked" />
      <Button label="Choose a different video" kind="quiet" onPress={onRetake} />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[3] },
  actions: { paddingHorizontal: margin, paddingTop: space[5], gap: space[3] },
  notice: { flexDirection: 'row', gap: space[3], margin: margin, padding: space[4], borderLeftWidth: 3, borderRadius: 6 },
  review: { paddingHorizontal: margin, paddingTop: space[4], gap: space[4] },
});
