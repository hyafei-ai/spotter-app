import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useTheme } from '../theme';
import { radius, space, touchMin } from '../tokens';
import { Text } from '../components/Text';
import { Button } from '../components/Button';

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const MAX_VOICE_MS = 2 * 60 * 1000;

/**
 * Record a voice note (C-6, K-1). Permission is asked when the person taps record, with a plain
 * reason if it's denied. Calls onDone with the local file and length; the caller uploads it.
 */
export function VoiceRecorder({ onDone, onCancel }: { onDone: (uri: string, durationMs: number) => void; onCancel: () => void }) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder, 250);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return setDenied(true);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError('Couldn’t start recording. Try again.');
    }
  };
  const stop = async () => {
    const ms = status.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    if (recorder.uri && ms > 500) onDone(recorder.uri, Math.round(ms));
    else setError('That was too short to send.');
  };
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });

  // Stop at the 2-minute cap.
  useEffect(() => {
    if (!status.isRecording) return;
    const t = setTimeout(() => void stopRef.current(), Math.max(0, MAX_VOICE_MS - status.durationMillis));
    return () => clearTimeout(t);
    // Only re-arm when recording starts or stops, not on every duration tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.isRecording]);

  if (denied) {
    return (
      <View style={styles.box}>
        <Text>Microphone access is off. Turn it on in Settings to send voice notes.</Text>
        <Button label="Close" kind="quiet" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={[styles.box, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.isRecording ? 'Stop and send voice note' : 'Start recording'}
          onPress={() => void (status.isRecording ? stop() : start())}
          style={[styles.rec, { backgroundColor: status.isRecording ? colors.error : colors.brand }]}
        >
          <Feather name={status.isRecording ? 'square' : 'mic'} size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">
            {status.isRecording ? `Recording ${clock(status.durationMillis)}` : 'Tap to record'}
          </Text>
          <Text variant="caption" color="ink2">
            Up to 2 minutes. Tap again to stop.
          </Text>
        </View>
        <Button label="Cancel" kind="quiet" full={false} onPress={() => void recorder.stop().catch(() => {}).then(onCancel)} />
      </View>
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Plays a voice note inline in a thread. */
export function VoicePlayer({ uri, durationMs }: { uri: string; durationMs: number | null }) {
  const { colors } = useTheme();
  const player = useAudioPlayer(uri);
  const st = useAudioPlayerStatus(player);
  const total = st.duration ? st.duration * 1000 : (durationMs ?? 0);
  const playing = st.playing;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : `Play voice note, ${clock(total)}`}
        onPress={() => {
          if (playing) player.pause();
          else {
            if (st.didJustFinish || (st.currentTime && st.duration && st.currentTime >= st.duration)) void player.seekTo(0);
            player.play();
          }
        }}
        style={[styles.play, { borderColor: colors.line }]}
      >
        <Feather name={playing ? 'pause' : 'play'} size={18} color={colors.ink} />
      </Pressable>
      <Text variant="callout" tabular>
        {playing ? clock((st.currentTime ?? 0) * 1000) : clock(total)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control, padding: space[3], gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  rec: { width: touchMin, height: touchMin, borderRadius: touchMin / 2, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
