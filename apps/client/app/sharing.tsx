import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Banner, IconButton, Screen, SectionLabel, Text, useTheme, margin, space, touchMin } from '@spotter/ui';
import { SyncBanner } from '../src/SyncBanner';
import { tenant } from '../src/env';
import { isOn } from '../src/modules';
import { useDaily } from '../src/daily/store';
import { useCycle } from '../src/cycle/store';
import { useFuel } from '../src/fuel/store';
import { useInjury } from '../src/injury/store';
import { useHealthImports } from '../src/health/store';
import { useMobility } from '../src/mobility/store';

interface Row {
  key: string;
  title: string;
  /** What the coach sees while it's on. */
  sees: string;
  on: boolean;
  /** Null: no switch here (e.g. cycle while not tracking), with `note` and `link` instead. */
  set: ((on: boolean) => Promise<unknown> | void) | null;
  note?: string;
  link?: { label: string; href: '/cycle' | '/pain' | '/settings/daily-check' };
}

/**
 * Who sees what (docs/ux/client-experience.md): every kind of data, whether the coach sees it, and the switch.
 * The switches here are the same ones as on each screen (they share the stores), so there's one truth.
 */
export default function Sharing() {
  const { colors, scheme } = useTheme();
  const first = tenant.coach.name.split(' ')[0] ?? 'Your coach';
  const daily = useDaily((s) => s.settings.shareDefault);
  const setDaily = useDaily((s) => s.setSettings);
  const cycleMode = useCycle((s) => s.mode);
  const cycleShare = useCycle((s) => s.shareWithCoach);
  const setCycleShare = useCycle((s) => s.setShare);
  const fuelShare = useFuel((s) => s.settings.shareWithCoach);
  const setFuel = useFuel((s) => s.setSettings);
  const painShare = useInjury((s) => s.shareDefault);
  const setPain = useInjury((s) => s.setShareAll);
  const importedShare = useHealthImports((s) => s.shareImported);
  const setImported = useHealthImports((s) => s.setShareImported);
  const mobilityShare = useMobility((s) => s.shareWithCoach);
  const setMobility = useMobility((s) => s.setShare);
  const [error, setError] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/body'));

  const tracking = cycleMode !== 'not_tracking';
  const rows: Row[] = [
    {
      key: 'daily',
      title: 'Daily read',
      sees: 'How today looks (“running tired”) and the reasons in plain words, plus any note you add',
      on: daily,
      set: (on) => setDaily({ shareDefault: on }),
      note: 'Your default for each check-in. You can still change one day when you check in.',
    },
    tracking
      ? {
          key: 'cycle',
          title: 'Cycle',
          sees: 'Today’s estimated phase and what your training data shows (for example “lifts run about 3% lower in the luteal phase”)',
          on: cycleShare,
          set: (on) => setCycleShare(on),
        }
      : { key: 'cycle', title: 'Cycle', sees: '', on: false, set: null, note: 'You’re not tracking your cycle, so there’s nothing to share.', link: { label: 'Your cycle', href: '/cycle' } },
    ...(isOn('nutrition')
      ? [
          {
            key: 'fuel',
            title: 'Fuel check',
            sees: 'Only the level (“worth a look”) and the signs it noticed, in words',
            on: fuelShare,
            set: (on: boolean) => setFuel({ shareWithCoach: on }),
          },
        ]
      : []),
    {
      key: 'pain',
      title: 'Pain',
      sees: 'Where it hurts, how much (0–10) and your note, so the program can work around it',
      on: painShare,
      set: (on) => setPain(on),
      note: 'Applies to every log. You can still change one log on the Pain screen.',
      link: { label: 'Pain', href: '/pain' },
    },
    {
      key: 'imported',
      title: 'Workouts from your watch',
      sees: 'Type, date, length and distance (for example “Run · 5.2 km · 34 min”), never heart rate or calories',
      on: importedShare,
      set: (on) => setImported(on),
    },
    {
      key: 'mobility',
      title: 'Mobility',
      sees: 'Minutes and type, like your sessions (“10 min · Hip and ankle mobility”)',
      on: mobilityShare,
      set: (on) => setMobility(on),
    },
  ];

  const attempt = (fn: () => Promise<unknown> | void) => {
    setError(false);
    Promise.resolve()
      .then(fn)
      .catch(() => setError(true));
  };

  return (
    <Screen
      banner={
        <>
          <SyncBanner />
          {error ? <Banner tone="error" message="Couldn’t save on this phone. Try again." /> : null}
        </>
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Who sees what
        </Text>
        <Text color="ink2">{`Your sessions and messages are shared with ${first}: that’s coaching. Everything about your body is yours, and ${first} sees it only when you say so.`}</Text>
      </View>

      <SectionLabel>{`What ${first} can see`}</SectionLabel>
      {rows.map((r, i) => (
        <View key={r.key} style={[styles.row, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }]}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{r.title}</Text>
              <View style={styles.status}>
                <Feather name={r.on ? 'eye' : 'lock'} size={14} color={r.on ? colors.ink : colors.ink2} />
                <Text variant="callout" style={{ fontFamily: 'SourceSans3_600SemiBold' }} color={r.on ? 'ink' : 'ink2'}>
                  {r.on ? `${first} sees` : 'Only you'}
                </Text>
              </View>
            </View>
            {r.set ? (
              <Switch
                value={r.on}
                onValueChange={(on) => attempt(() => r.set!(on))}
                accessibilityLabel={`Share ${r.title.toLowerCase()} with ${first}`}
                accessibilityHint={r.on ? `${first} sees it now` : 'Only you see it now'}
                trackColor={{ true: colors.brand, false: colors.line }}
                // In dark mode a surface-coloured thumb disappears into the track; the ink thumb stays visible.
                thumbColor={scheme === 'dark' ? colors.ink : colors.surface}
                {...{ activeThumbColor: scheme === 'dark' ? colors.ink : colors.surface }}
              />
            ) : null}
          </View>
          {r.on && r.sees ? (
            <Text variant="callout" color="ink2">
              {r.sees}.
            </Text>
          ) : null}
          {r.note ? (
            <Text variant="caption" color="ink2">
              {r.note}
            </Text>
          ) : null}
          {r.link ? (
            <Pressable onPress={() => router.push(r.link!.href)} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
              <Text variant="callout" style={{ color: colors.brand, fontFamily: 'SourceSans3_600SemiBold' }}>
                {`Open ${r.link.label}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      <SectionLabel>{`${first} never sees`}</SectionLabel>
      <View style={[styles.body, { gap: space[2] }]}>
        {['Your period dates or symptoms', 'Your food logs, calories or body fat', 'Raw heart data from your watch (only the daily read’s plain words, when you share it)', 'Anything you switch to “Only you” above'].map((t) => (
          <View key={t} style={styles.never}>
            <Feather name="lock" size={16} color={colors.ink2} />
            <Text style={{ flex: 1 }}>{t}</Text>
          </View>
        ))}
        <Text variant="caption" color="ink2" style={{ marginTop: space[2] }}>
          {`Turning cycle, fuel, pain, watch workouts or mobility off also hides what was shared before. Daily reads you already shared stay with ${first}; the switch applies from your next check-in. Changes save on this phone and sync when you’re online.`}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
  row: { marginHorizontal: margin, paddingVertical: space[4], gap: space[1] },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchMin },
  status: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  never: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 28 },
});
