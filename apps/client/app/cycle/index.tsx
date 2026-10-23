import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  CONFIDENCE_RANK,
  CONFIDENCE_WORDS,
  CYCLE_MODE_LABEL,
  CYCLE_PHASE_LABEL,
  SYMPTOMS,
  SYMPTOM_LABEL,
  SYMPTOM_LEVEL_LABEL,
  activeCalibrator,
  phaseLine,
  type CycleMode,
  type PhaseAdjustment,
  type Symptom,
} from '@spotter/core';
import { Banner, Button, IconButton, ListRow, Screen, SectionLabel, SegmentedControl, Sheet, Skeleton, Stepper, Tag, Text, useTheme, margin, space, touchMin } from '@spotter/ui';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { localDate } from '../../src/nutrition/store';
import { useCycle, type StoredPeriod } from '../../src/cycle/store';
import { useCycleToday } from '../../src/cycle/hooks';
import { readHealthPeriods } from '../../src/cycle/healthPeriods';

const MODE_ORDER: CycleMode[] = ['natural', 'hormonal', 'irregular', 'perimenopause', 'postmenopause', 'pregnant_postpartum', 'not_tracking'];
const MODE_HELP: Record<CycleMode, string> = {
  natural: 'Periods come roughly monthly, no hormonal contraception.',
  hormonal: 'Pill, ring, patch, implant or hormonal IUD. No phases: your own day-to-day data instead.',
  irregular: 'Cycles vary a lot. Phases only once your own data is steady enough.',
  perimenopause: 'Cycles changing before menopause. Phases only when predictable; symptoms help.',
  postmenopause: 'No period for a year or more. No phases; log symptoms if useful.',
  pregnant_postpartum: 'No phases, and cycle-based load changes are paused.',
  not_tracking: 'Nothing about your cycle is used.',
};
const PHASED: CycleMode[] = ['natural', 'irregular', 'perimenopause'];
const SYMPTOM_FIRST: CycleMode[] = ['perimenopause', 'postmenopause'];
const HEALTH_NAME = Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';
const LEVELS = SYMPTOM_LEVEL_LABEL.map((label, i) => ({ value: String(i), label }));

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => localDate(new Date(Date.parse(`${iso}T12:00:00`) + n * DAY));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / DAY);
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

function runsText(a: PhaseAdjustment): string {
  if (a.sessions === 0) return 'No sessions yet';
  if (Math.abs(a.deltaPct) < 1) return 'About your usual';
  return `About ${Math.round(Math.abs(a.deltaPct))}% ${a.deltaPct < 0 ? 'under' : 'over'} your usual`;
}

/** Me → Your cycle: mode, periods, today's estimate, what the training data shows, sharing, symptoms. */
export default function CycleScreen() {
  const { colors } = useTheme();
  const hydrated = useCycle((s) => s.hydrated);
  const periods = useCycle((s) => s.periods);
  const symptoms = useCycle((s) => s.symptoms);
  const setMode = useCycle((s) => s.setMode);
  const setShare = useCycle((s) => s.setShare);
  const deletePeriod = useCycle((s) => s.deletePeriod);
  const savePeriod = useCycle((s) => s.savePeriod);
  const importPeriods = useCycle((s) => s.importPeriods);
  const logSymptom = useCycle((s) => s.logSymptom);
  const { today, profile, estimate, calibration } = useCycleToday();
  const first = tenant.coach.name.split(' ')[0] ?? '';
  const [editing, setEditing] = useState<StoredPeriod | 'new' | null>(null);
  const [modesOpen, setModesOpen] = useState(false);
  const [symptomsOpen, setSymptomsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  const attempt = async (fn: () => Promise<unknown>) => {
    setError(false);
    try {
      await fn();
    } catch {
      setError(true);
    }
  };

  if (!hydrated) {
    return (
      <Screen>
        <View style={[styles.body, { paddingTop: space[10] }]}>
          <Skeleton width="50%" height={28} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </View>
      </Screen>
    );
  }

  const tracking = profile.mode !== 'not_tracking';
  const phased = PHASED.includes(profile.mode);
  const todaySymptoms = symptoms.find((s) => s.date === today)?.scores ?? {};
  const showSymptoms = tracking && (SYMPTOM_FIRST.includes(profile.mode) || symptomsOpen);
  const symptomOrder: Symptom[] = SYMPTOM_FIRST.includes(profile.mode) ? [...SYMPTOMS] : ['cramps', 'bloating', 'headache', 'poor_sleep', 'low_mood', 'brain_fog', 'joint_aches', 'hot_flashes', 'night_sweats'];
  const sorted = [...periods].sort((a, b) => b.start.localeCompare(a.start));

  const importFromHealth = () =>
    attempt(async () => {
      const added = await importPeriods(await readHealthPeriods());
      setNotice(added ? `Added ${added} period${added === 1 ? '' : 's'} from ${HEALTH_NAME}.` : `Nothing new in ${HEALTH_NAME}.`);
    });

  return (
    <Screen
      banner={
        <>
          <SyncBanner />
          {error ? <Banner tone="error" message="Couldn’t save on this phone. Try again." /> : null}
          {notice ? <Banner message={notice} actionLabel="OK" onAction={() => setNotice(null)} /> : null}
        </>
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Your cycle
        </Text>
        <Text color="ink2">Private to you unless you share it. Used to fit training to your own data, never to diagnose anything.</Text>
      </View>

      {/* ---------- mode ---------- */}
      <SectionLabel>How your cycle works now</SectionLabel>
      {modesOpen ? (
        MODE_ORDER.map((m, i) => (
          <ListRow
            key={m}
            title={CYCLE_MODE_LABEL[m]}
            subtitle={MODE_HELP[m]}
            right={m === profile.mode ? <Feather name="check" size={20} color={colors.brand} /> : undefined}
            accessibilityLabel={`${CYCLE_MODE_LABEL[m]}${m === profile.mode ? ', selected' : ''}. ${MODE_HELP[m]}`}
            last={i === MODE_ORDER.length - 1}
            onPress={() => {
              setModesOpen(false);
              void attempt(() => setMode(m));
            }}
          />
        ))
      ) : (
        <ListRow title={CYCLE_MODE_LABEL[profile.mode]} subtitle={MODE_HELP[profile.mode]} chevron accessibilityHint="Change how your cycle works now" onPress={() => setModesOpen(true)} last />
      )}

      {/* ---------- today ---------- */}
      {tracking ? (
        <>
          <SectionLabel>Today</SectionLabel>
          <View style={[styles.body, { gap: space[1] }]} accessibilityLiveRegion="polite">
            {phaseLine(estimate) ? <Text variant="headline">{phaseLine(estimate)}</Text> : null}
            <Text variant="callout">{estimate.note}</Text>
            {phased ? (
              <Text variant="caption" color="ink2">
                {CONFIDENCE_WORDS[estimate.confidence]}
                {estimate.typicalLength ? ` · your cycles usually run about ${estimate.typicalLength} days` : ''}
              </Text>
            ) : null}
            {estimate.nextPeriod ? (
              <Text variant="callout">
                Next period likely {day(estimate.nextPeriod.from)} to {day(estimate.nextPeriod.to)}
              </Text>
            ) : null}
            {estimate.irregularities.map((t) => (
              <Text key={t} variant="caption" color="ink2">
                {'· '}
                {t}
              </Text>
            ))}
            {estimate.irregularities.length ? (
              <Text variant="caption" color="ink2">
                Changes like these are worth mentioning to a doctor if they continue.
              </Text>
            ) : null}
            <Text variant="caption" color="ink2">
              An estimate from your own logs, not a diagnosis.
            </Text>
          </View>
        </>
      ) : null}

      {/* ---------- periods ---------- */}
      {tracking && profile.mode !== 'postmenopause' ? (
        <>
          <SectionLabel>Periods</SectionLabel>
          {sorted.length === 0 ? (
            <View style={styles.body}>
              <Text color="ink2">No periods logged yet. Log the first day of your last period to start.</Text>
            </View>
          ) : (
            sorted.map((p, i) => (
              <ListRow
                key={p.id}
                title={`Started ${day(p.start)}`}
                subtitle={[p.end ? `${daysBetween(p.start, p.end) + 1} days` : 'End not logged', p.source === 'health' ? `From ${HEALTH_NAME}` : null].filter(Boolean).join(' · ')}
                chevron
                accessibilityHint="Edit or delete this period"
                last={i === sorted.length - 1}
                onPress={() => setEditing(p)}
              />
            ))
          )}
          <View style={[styles.body, { gap: space[2] }]}>
            <Button label="Log a period" kind="secondary" icon="plus" onPress={() => setEditing('new')} />
            <Button label={`Import from ${HEALTH_NAME}`} kind="quiet" onPress={() => void importFromHealth()} />
            <Text variant="caption" color="ink2">
              Reads periods already in {HEALTH_NAME}, once, when you tap it. Nothing is written back, and imported periods stay private like the rest.
            </Text>
          </View>
        </>
      ) : null}

      {/* ---------- calibration ---------- */}
      {phased ? (
        <>
          <SectionLabel>What your training data shows</SectionLabel>
          <View style={[styles.body, { gap: space[1] }]}>
            <Text variant="callout">{calibration.summary}</Text>
            <Text variant="caption" color="ink2">
              Method: {activeCalibrator(calibration.method).label}. Each lift is compared with your own last 8 weeks, never a population average. Changes are
              small (5% at most), only once the pattern holds over at least 2 cycles, and you can always use planned loads instead.
            </Text>
          </View>
          {calibration.adjustments.map((a, i) => (
            <ListRow
              key={a.phase}
              title={CYCLE_PHASE_LABEL[a.phase]}
              subtitle={[
                runsText(a),
                `${a.sessions} session${a.sessions === 1 ? '' : 's'}`,
                CONFIDENCE_WORDS[a.confidence],
                a.appliedPct ? `Applied: ${Math.abs(a.appliedPct)}% ${a.appliedPct < 0 ? 'lighter' : 'heavier'}` : CONFIDENCE_RANK[a.confidence] >= 2 ? 'Not applied: close to usual' : 'Not applied yet',
              ].join(' · ')}
              last={i === calibration.adjustments.length - 1}
            />
          ))}
        </>
      ) : tracking ? (
        <>
          <SectionLabel>What your training data shows</SectionLabel>
          <View style={styles.body}>
            <Text variant="callout" color="ink2">
              No load changes by phase in this mode. Your daily check and training data still shape your read.
            </Text>
          </View>
        </>
      ) : null}

      {/* ---------- sharing ---------- */}
      {tracking ? (
        <>
          <SectionLabel>{`Sharing with ${first}`}</SectionLabel>
          <View style={[styles.body, { gap: space[2] }]}>
            <Toggle label={`Share with ${first}`} value={profile.shareWithCoach} onChange={(on) => void attempt(() => setShare(on))} />
            <Text variant="caption" color="ink2">
              {profile.shareWithCoach
                ? `${first} sees today’s estimated phase and the summary of what your training data shows, including any load change. Never your period dates, symptoms or mode.`
                : `Off. ${first} sees nothing about your cycle. If you turn it on, ${first} sees only today’s estimated phase and the training-data summary, never period dates or symptoms.`}
            </Text>
          </View>
        </>
      ) : null}

      {/* ---------- symptoms ---------- */}
      {tracking ? (
        <>
          <SectionLabel>Symptoms today</SectionLabel>
          {showSymptoms ? (
            <View style={[styles.body, { gap: space[4] }]}>
              {symptomOrder.map((s) => (
                <View key={s} style={{ gap: space[1] }}>
                  <Text variant="label" color="ink2">
                    {SYMPTOM_LABEL[s]}
                  </Text>
                  <SegmentedControl
                    label={`${SYMPTOM_LABEL[s]} today, none to severe`}
                    value={todaySymptoms[s] != null ? String(todaySymptoms[s]) : null}
                    onChange={(v) => void attempt(() => logSymptom(s, Number(v)))}
                    options={LEVELS}
                  />
                </View>
              ))}
              <Text variant="caption" color="ink2">
                Private: never shared with {first}. Helps you spot patterns over time.
              </Text>
            </View>
          ) : (
            <View style={styles.body}>
              <Pressable onPress={() => setSymptomsOpen(true)} accessibilityRole="button" style={[styles.row, { minHeight: touchMin }]}>
                <Text style={{ flex: 1 }}>Log symptoms (optional, private)</Text>
                <Feather name="chevron-down" size={20} color={colors.ink2} />
              </Pressable>
            </View>
          )}
        </>
      ) : null}

      <PeriodSheet
        editing={editing}
        today={today}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          setEditing(null);
          void attempt(() => savePeriod(p));
        }}
        onDelete={(id) => {
          setEditing(null);
          void attempt(() => deletePeriod(id));
        }}
      />
    </Screen>
  );
}

/** Add or edit one period: start as "days ago", optional length. */
function PeriodSheet({
  editing,
  today,
  onClose,
  onSave,
  onDelete,
}: {
  editing: StoredPeriod | 'new' | null;
  today: string;
  onClose: () => void;
  onSave: (p: { id?: string; start: string; end: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const existing = editing && editing !== 'new' ? editing : null;
  return (
    <Sheet visible={!!editing} title={existing ? 'Edit period' : 'Log a period'} onClose={onClose}>
      {editing ? <PeriodForm key={existing?.id ?? 'new'} existing={existing} today={today} onSave={onSave} onDelete={onDelete} /> : null}
    </Sheet>
  );
}

function PeriodForm({
  existing,
  today,
  onSave,
  onDelete,
}: {
  existing: StoredPeriod | null;
  today: string;
  onSave: (p: { id?: string; start: string; end: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [ago, setAgo] = useState(existing ? Math.max(0, daysBetween(existing.start, today)) : 0);
  const [ended, setEnded] = useState(!!existing?.end);
  const [length, setLength] = useState(existing?.end ? daysBetween(existing.start, existing.end) + 1 : 5);
  const start = addDays(today, -ago);
  // A period can't be logged as ending after today.
  const maxLength = Math.max(1, Math.min(20, ago + 1));
  return (
    <View style={[styles.body, { gap: space[4] }]}>
      <Stepper label="First day" value={ago} step={1} min={0} max={400} format={(v) => (v === 0 ? 'Today' : v === 1 ? 'Yesterday' : day(addDays(today, -v)))} onChange={setAgo} />
      <Toggle label="It has ended" value={ended} onChange={setEnded} />
      {ended ? (
        <Stepper label="How many days" value={Math.min(length, maxLength)} step={1} min={1} max={maxLength} format={(v) => `${v} day${v === 1 ? '' : 's'}`} unitLabel="days" onChange={setLength} />
      ) : (
        <Text variant="caption" color="ink2">
          Without an end, the app counts about 5 days.
        </Text>
      )}
      <Button
        label="Save"
        onPress={() => onSave({ id: existing?.id, start, end: ended ? addDays(start, Math.min(length, maxLength) - 1) : null })}
      />
      {existing ? <Button label="Delete this period" kind="destructive" onPress={() => onDelete(existing.id)} /> : null}
      <Tag label="Private" />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { minHeight: touchMin }]}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.brand, false: colors.line }} thumbColor={colors.surface} {...{ activeThumbColor: colors.surface }} />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingVertical: space[3], gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
