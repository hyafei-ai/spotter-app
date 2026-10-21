import { useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import {
  ADHERENCE,
  ADHERENCE_LABEL,
  EMPTY_ANSWERS,
  MEASUREMENT_LABEL,
  PHOTO_POSES,
  fromDisplay,
  missingCheckInFields,
  toDisplay,
  type CheckInAnswers,
  type PhotoPose,
} from '@spotter/core';
import { Banner, Button, IconButton, Screen, SectionLabel, SegmentedControl, Skeleton, Text, TextField, useTheme, margin, radius, space } from '@spotter/ui';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { longDate } from '../../src/format';
import { todayString, useCheckIns } from '../../src/checkins/store';

const num = (s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

/** C-7 weekly check-in. `id` is the due date (YYYY-MM-DD). */
export default function CheckIn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { loaded, load, template, submissions, reviews, submit } = useCheckIns();
  const [answers, setAnswers] = useState<CheckInAnswers>(EMPTY_ANSWERS);
  const [weightText, setWeightText] = useState('');
  const [photos, setPhotos] = useState<Partial<Record<PhotoPose, string>>>({});
  const [photoDenied, setPhotoDenied] = useState(false);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const first = tenant.coach.name.split(' ')[0];
  const unit = tenant.units;

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/today'));
  const done = submissions.find((s) => s.dueDate === id);

  if (!loaded) {
    return (
      <Screen>
        <View style={{ padding: margin, gap: space[3], paddingTop: space[10] }}>
          <Skeleton width="50%" height={28} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </View>
      </Screen>
    );
  }

  if (done) {
    const reviewed = reviews[done.id] ?? done.reviewedAt;
    const a = done.answers;
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={back} />
        </View>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            Check-in sent
          </Text>
          <Text color="ink2">
            {longDate(done.dueDate)} · {reviewed ? `${first} has read it` : `${first} hasn’t read it yet`}
          </Text>
        </View>
        <SectionLabel>Your answers</SectionLabel>
        <View style={styles.body}>
          {a.bodyweightKg != null ? <Line label="Bodyweight" value={`${Math.round(toDisplay(a.bodyweightKg, unit) * 10) / 10} ${unit}`} /> : null}
          {Object.entries(a.measurementsCm).map(([k, v]) => (
            <Line key={k} label={MEASUREMENT_LABEL[k as keyof typeof MEASUREMENT_LABEL] ?? k} value={`${v} cm`} />
          ))}
          {a.sleepHours != null ? <Line label="Sleep" value={`${a.sleepHours} h a night`} /> : null}
          {a.stress != null ? <Line label="Stress" value={`${a.stress} of 5`} /> : null}
          {a.adherence ? <Line label="Plan done" value={ADHERENCE_LABEL[a.adherence]} /> : null}
          {a.notes ? <Line label="Notes" value={a.notes} /> : null}
          <Line label="Photos" value={done.photos.length ? `${done.photos.length} (only you and ${first} can see them)` : 'None'} />
        </View>
      </Screen>
    );
  }

  const set = (patch: Partial<CheckInAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const missing = missingCheckInFields(template, answers);
  const today = todayString();
  const overdueDays = id && id < today ? Math.round((Date.parse(today) - Date.parse(id)) / 86_400_000) : 0;

  const pickPhoto = async (pose: PhotoPose) => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return setPhotoDenied(true);
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [3, 4] });
    if (!res.canceled && res.assets[0]) setPhotos((p) => ({ ...p, [pose]: res.assets[0]!.uri }));
  };

  const send = async () => {
    setTried(true);
    if (missing.length || !id) return;
    setSending(true);
    await submit(
      id,
      answers,
      PHOTO_POSES.filter((p) => photos[p]).map((pose) => ({ pose, uri: photos[pose]! })),
    );
    router.replace('/today');
  };

  return (
    <Screen
      banner={
        <>
          <SyncBanner />
          {overdueDays > 0 ? <Banner tone="warning" message={`This was due ${longDate(id!)}. Send it when you can.`} /> : null}
        </>
      }
      footer={
        <Button
          label="Send check-in"
          onPress={() => void send()}
          loading={sending}
          disabled={tried && missing.length > 0}
          disabledReason={missing.length ? `Still needed: ${missing.join(', ')}` : undefined}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Weekly check-in
        </Text>
        <Text color="ink2">
          {first} uses this to plan your next week. {id ? `Due ${longDate(id)}.` : ''}
        </Text>
      </View>

      <View style={styles.body}>
        {template.fields.bodyweight ? (
          <TextField
            label={`Bodyweight (${unit})`}
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={weightText}
            onChangeText={(t) => {
              setWeightText(t);
              const n = num(t);
              set({ bodyweightKg: n == null ? null : fromDisplay(n, unit) });
            }}
            placeholder="Morning, before food"
            error={tried && answers.bodyweightKg == null ? 'Add your bodyweight to send.' : undefined}
          />
        ) : null}
        {template.fields.measurements.map((m) => (
          <TextField
            key={m}
            label={`${MEASUREMENT_LABEL[m]} (cm)`}
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={answers.measurementsCm[m] != null ? String(answers.measurementsCm[m]) : ''}
            onChangeText={(t) => {
              const n = num(t);
              const next = { ...answers.measurementsCm };
              if (n == null) delete next[m];
              else next[m] = n;
              set({ measurementsCm: next });
            }}
            error={tried && answers.measurementsCm[m] == null ? 'Add this measurement to send.' : undefined}
          />
        ))}
        {template.fields.sleep ? (
          <TextField
            label="Average sleep (hours a night)"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={answers.sleepHours != null ? String(answers.sleepHours) : ''}
            onChangeText={(t) => set({ sleepHours: num(t) })}
            error={tried && answers.sleepHours == null ? 'Add your sleep to send.' : undefined}
          />
        ) : null}
        {template.fields.stress ? (
          <View style={{ gap: space[2] }}>
            <Text variant="label" color="ink2">
              Stress this week · 1 calm, 5 very stressed
            </Text>
            <SegmentedControl
              label="Stress this week, 1 calm, 5 very stressed"
              value={answers.stress != null ? String(answers.stress) : null}
              onChange={(v) => set({ stress: Number(v) })}
              options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))}
            />
          </View>
        ) : null}
        {template.fields.adherence ? (
          <View style={{ gap: space[2] }}>
            <Text variant="label" color="ink2">
              How much of the plan did you do?
            </Text>
            <SegmentedControl
              label="How much of the plan did you do?"
              value={answers.adherence}
              onChange={(v) => set({ adherence: v })}
              options={ADHERENCE.map((v) => ({ value: v, label: ADHERENCE_LABEL[v] }))}
            />
          </View>
        ) : null}
        {template.fields.notes ? (
          <TextField
            label="Anything else (optional)"
            value={answers.notes ?? ''}
            onChangeText={(t) => set({ notes: t.trim() ? t : null })}
            multiline
            placeholder="How training felt, anything coming up"
          />
        ) : null}
      </View>

      {template.fields.photos ? (
        <>
          <SectionLabel>Progress photos (optional)</SectionLabel>
          <View style={styles.body}>
            <View style={styles.privacy}>
              <Feather name="lock" size={14} color={colors.ink2} />
              <Text variant="caption" color="ink2" style={{ flex: 1 }}>
                Only you and {first} can see these. They’re never used for anything else.
              </Text>
            </View>
            {photoDenied ? (
              <View style={[styles.notice, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]} accessibilityRole="alert">
                <Text>
                  {tenant.appName} can’t see your photos. Turn on access in Settings → {tenant.appName} → Photos, or skip photos this week.
                </Text>
                <Button label="Open Settings" kind="secondary" full={false} onPress={() => void Linking.openSettings()} />
              </View>
            ) : null}
            <View style={styles.photos}>
              {PHOTO_POSES.map((pose) => (
                <Pressable
                  key={pose}
                  accessibilityRole="button"
                  accessibilityLabel={photos[pose] ? `Change ${pose} photo` : `Add ${pose} photo`}
                  onPress={() => void pickPhoto(pose)}
                  style={[styles.photo, { borderColor: colors.line, backgroundColor: colors.surface }]}
                >
                  {photos[pose] ? (
                    <Image source={{ uri: photos[pose] }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                  ) : (
                    <Feather name="plus" size={22} color={colors.ink2} />
                  )}
                  <Text variant="label" style={[styles.poseLabel, { color: photos[pose] ? '#F1ECE2' : colors.ink2 }]}>
                    {pose}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="label" color="ink2">
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[4], gap: space[4] },
  privacy: { flexDirection: 'row', gap: space[2], alignItems: 'center' },
  notice: { padding: space[4], borderLeftWidth: 3, borderRadius: 6, gap: space[3] },
  photos: { flexDirection: 'row', gap: space[2] },
  photo: { flex: 1, aspectRatio: 3 / 4, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  poseLabel: { position: 'absolute', bottom: space[2], left: space[2] },
});
