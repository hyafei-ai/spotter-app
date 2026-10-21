import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Feather } from '@expo/vector-icons';
import { clock } from '@spotter/core';
import { useTheme } from '../theme';
import { radius, space, touchMin } from '../tokens';
import { resolveMedia } from '../mediaStore';
import { Text } from './Text';

/** Plays a coach's voice-over (K-5) for a stored media ref. */
export function VoiceOver({ mediaRef, durationMs, label = 'Voice-over' }: { mediaRef: string; durationMs: number; label?: string }) {
  const { colors } = useTheme();
  const [src, setSrc] = useState<string | number | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    void resolveMedia(mediaRef).then((s) => {
      if (!live) return;
      if (s == null) setMissing(true);
      else setSrc(s);
    });
    return () => {
      live = false;
    };
  }, [mediaRef]);
  const player = useAudioPlayer(src);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  return (
    <View style={[styles.wrap, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={missing ? `${label} unavailable` : playing ? `Pause ${label}` : `Play ${label}`}
        disabled={missing || src == null}
        onPress={() => {
          if (playing) player.pause();
          else {
            if (status.didJustFinish || (status.duration && status.currentTime >= status.duration - 0.1)) void player.seekTo(0);
            player.play();
          }
        }}
        style={[styles.btn, { backgroundColor: colors.ink, opacity: missing ? 0.4 : 1 }]}
      >
        <Feather name={playing ? 'pause' : 'mic'} size={18} color={colors.paper} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" color="ink2" tabular>
          {missing ? 'This recording isn’t on this device.' : `${clock((status.currentTime || 0) * 1000)} / ${clock(durationMs)}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control },
  btn: { width: touchMin, height: touchMin, borderRadius: touchMin / 2, alignItems: 'center', justifyContent: 'center' },
});
