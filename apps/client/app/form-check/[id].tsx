import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { previousOfSameLift, uploadLabel, type FormCheck } from '@spotter/core';
import {
  AnnotationList,
  Banner,
  Button,
  EmptyState,
  IconButton,
  PlaybackControls,
  Screen,
  SectionLabel,
  Text,
  VideoStage,
  VoiceOver,
  useMediaPlayer,
  useTheme,
  margin,
  space,
} from '@spotter/ui';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { useFormChecks, useMergedChecks } from '../../src/formchecks/store';
import { markReplySeen } from '../../src/formchecks/seen';

const short = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** C-5 form check: upload status, then the coach's reply on the video (notes, drawings, voice-over, compare). */
export default function FormCheckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useFormChecks((s) => s.loaded);
  const load = useFormChecks((s) => s.load);
  const checks = useMergedChecks();
  const check = checks.find((c) => c.id === id);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  useEffect(() => {
    if (check?.upload.status === 'replied') void markReplySeen(check.id);
  }, [check?.id, check?.upload.status]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/form-check'));

  if (!loaded) return <Screen>{null}</Screen>;
  if (!check) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={back} />
        </View>
        <EmptyState message="This form check isn’t on this phone." actionLabel="See your form checks" onAction={() => router.replace('/form-check')} />
      </Screen>
    );
  }
  return <Detail check={check} previous={previousOfSameLift(checks, check)} back={back} />;
}

function Detail({ check, previous, back }: { check: FormCheck; previous: FormCheck | null; back: () => void }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const { pause, resume } = useFormChecks();
  const [compare, setCompare] = useState(false);
  const main = useMediaPlayer(check.videoUri);
  const other = useMediaPlayer(compare && previous ? previous.videoUri : null);
  const first = tenant.coach.name.split(' ')[0];
  const u = check.upload;
  const replied = u.status === 'replied';
  const voice = check.annotations.find((a) => a.kind === 'voice');
  const seek = (ms: number) =>
    [main.player, ...(compare ? [other.player] : [])].forEach((p) => {
      if (p) p.currentTime = ms / 1000;
    });

  return (
    <Screen
      banner={
        <>
          <SyncBanner />
          {u.status === 'failed' ? (
            <Banner tone="error" message={`Upload failed: ${u.message}. The video is saved on your phone.`} actionLabel="Try again" onAction={() => resume(check.id)} />
          ) : null}
        </>
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {check.exerciseName}
        </Text>
        <Text color="ink2">{[check.setLabel, short(check.createdAt)].filter(Boolean).join(' · ')}</Text>
      </View>

      <Status check={check} onPause={() => pause(check.id)} onResume={() => resume(check.id)} />

      <View style={styles.body}>
        {compare && previous ? (
          <View style={styles.compare}>
            <View style={{ flex: 1, gap: space[1] }}>
              <Text variant="label" color="ink2">
                {short(previous.createdAt)}
              </Text>
              <VideoStage player={other.player} annotations={previous.annotations} label={`Earlier video from ${short(previous.createdAt)}`} showNotes={false} />
            </View>
            <View style={{ flex: 1, gap: space[1] }}>
              <Text variant="label" color="ink2">
                This one
              </Text>
              <VideoStage player={main.player} annotations={check.annotations} label="This video" showNotes={false} />
            </View>
          </View>
        ) : main.missing ? (
          <EmptyState message="This video isn’t on this device any more." />
        ) : (
          <VideoStage
            player={main.player}
            annotations={check.annotations}
            label={`Video of ${check.exerciseName}`}
            onRetry={main.retry}
            maxHeight={Math.round(height * 0.6)}
          />
        )}
        <PlaybackControls players={compare ? [main.player, other.player] : [main.player]} />
        {previous ? (
          <Button
            label={compare ? 'Show this video only' : `Compare with ${short(previous.createdAt)}`}
            kind="secondary"
            icon="columns"
            onPress={() => setCompare((c) => !c)}
          />
        ) : null}
      </View>

      {check.clientNote ? (
        <View style={[styles.quote, { borderLeftColor: colors.line }]}>
          <Text variant="label" color="ink2">
            Your note
          </Text>
          <Text variant="callout">{check.clientNote}</Text>
        </View>
      ) : null}

      {replied ? (
        <>
          <SectionLabel>{`From ${first}`}</SectionLabel>
          <View style={[styles.body, { gap: space[3] }]}>
            {check.replySummary ? <Text>{check.replySummary}</Text> : null}
            {voice && voice.kind === 'voice' ? <VoiceOver mediaRef={voice.uri} durationMs={voice.durationMs} label={`${first}’s voice-over`} /> : null}
          </View>
          <AnnotationList annotations={check.annotations} onSeek={seek} />
        </>
      ) : null}
    </Screen>
  );
}

function Status({ check, onPause, onResume }: { check: FormCheck; onPause: () => void; onResume: () => void }) {
  const { colors } = useTheme();
  const u = check.upload;
  const first = tenant.coach.name.split(' ')[0];
  const icon: keyof typeof Feather.glyphMap =
    u.status === 'replied' ? 'message-circle' : u.status === 'sent' || u.status === 'processing' ? 'check' : u.status === 'failed' ? 'alert-circle' : 'upload';
  const pct = u.status === 'uploading' || u.status === 'paused' ? (u.total ? u.sent / u.total : 0) : null;
  const text =
    u.status === 'sent' ? `Sent · waiting for ${first}` : u.status === 'replied' ? `${first} replied` : uploadLabel(u);
  return (
    <View style={[styles.status, { borderColor: colors.line }]} accessibilityLiveRegion="polite">
      <View style={styles.statusRow}>
        <Feather name={icon} size={18} color={u.status === 'failed' ? colors.error : u.status === 'replied' ? colors.brand : colors.ink2} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {text}
        </Text>
        {u.status === 'uploading' ? <Button label="Pause" kind="quiet" full={false} onPress={onPause} /> : null}
        {u.status === 'paused' && u.reason !== 'offline' ? <Button label="Resume" kind="quiet" full={false} onPress={onResume} /> : null}
      </View>
      {pct != null ? (
        <View style={[styles.bar, { backgroundColor: colors.line }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
          <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: colors.brand }]} />
        </View>
      ) : null}
      {u.status === 'paused' && u.reason === 'offline' ? (
        <Text variant="caption" color="ink2">
          It picks up where it left off when you’re back online.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[4], gap: space[4] },
  compare: { flexDirection: 'row', gap: space[2] },
  quote: { marginHorizontal: margin, marginTop: space[4], borderLeftWidth: 3, paddingLeft: space[3], gap: 2 },
  status: { marginHorizontal: margin, marginTop: space[4], padding: space[3], borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 6, gap: space[2] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4 },
});
