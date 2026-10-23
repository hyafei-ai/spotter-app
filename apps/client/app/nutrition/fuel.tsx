import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  ASSUMED_BODY_FAT_PCT,
  EA_BAND_LABEL,
  EA_CUTOFFS,
  FUEL_LEVEL_LABEL,
  FUEL_MIN_LOGGED_DAYS,
  STRENGTH_MET,
  eaBand,
  energyAvailability,
  formatNumber,
  type EaBand,
} from '@spotter/core';
import { EmptyState, IconButton, Screen, SectionLabel, SegmentedControl, Skeleton, Tag, Text, TextField, useTheme, margin, space, touchMin } from '@spotter/ui';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { isOn } from '../../src/modules';
import { useNutritionSetup } from '../../src/nutrition/setup';
import { dayLabel, kcal } from '../../src/nutrition/format';
import { useFuel } from '../../src/fuel/store';
import { healthProvider } from '../../src/fuel/healthIntake';
import { useFuelCheck } from '../../src/fuel/useFuelCheck';
import { useSharePublisher } from '../../src/fuel/FuelRows';

const BAND_WORD: Record<EaBand, string> = { adequate: 'adequate', reduced: 'reduced', low: 'low', unknown: '' };
/** Bars run to 60 kcal/kg FFM; anything above fills the row. */
const BAR_MAX = 60;

/**
 * Fuel check (docs/features/fuel.md): energy availability per day, the low-energy pattern screen in
 * words, signs and fixes, and how it's worked out. A screen, not a diagnosis.
 */
export default function FuelCheckScreen() {
  const setup = useNutritionSetup();
  const hydrated = useFuel((s) => s.hydrated);
  const { today, ffm, days, check, healthConnected } = useFuelCheck();
  useSharePublisher(check, today);
  const first = tenant.coach.name.split(' ')[0] ?? 'your coach';
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/nutrition'))} />;

  const head = (
    <View style={styles.head}>
      <Text variant="title" accessibilityRole="header">
        Fuel check
      </Text>
      <Text color="ink2">Is food keeping up with training? A screen, not a diagnosis.</Text>
    </View>
  );

  if (!setup || !hydrated) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        {head}
        <View style={[styles.body, { gap: space[3] }]}>
          <Skeleton height={56} />
          <Skeleton height={120} />
        </View>
      </Screen>
    );
  }

  // Entry points are hidden when nutrition is off; this covers a stale link.
  if (!isOn('nutrition') || setup.targets.mode === 'off') {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        {head}
        <EmptyState message={`The fuel check works from your food log. ${first} has food tracking switched off for you right now.`} />
      </Screen>
    );
  }

  const shown = days.filter((d) => d.date !== today);
  const anyLogged = shown.some((d) => d.intakeKcal != null);

  return (
    <Screen banner={<SyncBanner />}>
      <View style={styles.nav}>{back}</View>
      {head}

      <SectionLabel>Last two weeks</SectionLabel>
      <View style={[styles.body, { gap: space[2] }]} accessibilityLiveRegion="polite">
        <Text variant="figure">{FUEL_LEVEL_LABEL[check.level]}</Text>
        {check.eaAverage != null ? (
          <Text>
            Energy availability averaged {formatNumber(check.eaAverage)} kcal per kg fat-free mass: {EA_BAND_LABEL[check.eaBand].toLowerCase()}.
          </Text>
        ) : null}
        {check.note ? <Text color="ink2">{check.note}.</Text> : null}
        {!anyLogged && ffm ? <Text color="ink2">Nothing logged in the last two weeks yet. Log food in Spotter, or connect a health app another food app writes to.</Text> : null}
        <Text variant="caption" color="ink2">
          Screening bands, not a diagnosis: {EA_CUTOFFS.adequate}+ adequate, {EA_CUTOFFS.low} to {EA_CUTOFFS.adequate} reduced, under {EA_CUTOFFS.low} low.
          {ffm?.estimated ? ` ${ffm.note}.` : ''}
        </Text>
      </View>

      {check.signs.length ? (
        <>
          <SectionLabel>What it noticed</SectionLabel>
          <View style={[styles.body, { gap: space[2] }]}>
            {check.signs.map((s) => (
              <Bullet key={s.kind} text={s.text} />
            ))}
          </View>
        </>
      ) : null}

      {check.fixes.length ? (
        <>
          <SectionLabel>What helps</SectionLabel>
          <View style={[styles.body, { gap: space[2] }]}>
            {check.fixes.map((f) => (
              <Bullet key={f} text={`${f}.`} />
            ))}
          </View>
        </>
      ) : null}

      {ffm ? <DayBars days={shown} ffmKg={ffm.kg} today={today} /> : null}

      <Settings first={first} healthConnected={healthConnected} />
      <HowItWorks estimatedNote={ffm?.estimated ? ffm.note : null} />
    </Screen>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <Text color="ink2">{'·'}</Text>
      <Text style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

function DayBars({ days, ffmKg, today }: { days: ReturnType<typeof useFuelCheck>['days']; ffmKg: number; today: string }) {
  const { colors } = useTheme();
  return (
    <>
      <SectionLabel>Each day, kcal per kg fat-free mass</SectionLabel>
      {[...days].reverse().map((d) => {
        const ea = energyAvailability(d, ffmKg);
        const band = eaBand(ea);
        const trained = (d.exerciseKcal ?? 0) > 0;
        const value = ea == null ? 'Not logged' : `${formatNumber(ea)} · ${BAND_WORD[band]}`;
        const detail = [
          d.intake.kcal != null ? `${kcal(d.intake.kcal)} ${d.intake.label ? d.intake.label.charAt(0).toLowerCase() + d.intake.label.slice(1) : ''}`.trim() : null,
          trained ? `training ${kcal(d.exerciseKcal ?? 0)} (${d.exerciseSource === 'wearable' ? 'from your watch' : 'estimated'})` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <View
            key={d.date}
            style={[styles.dayRow, { borderBottomColor: colors.line }]}
            accessible
            accessibilityLabel={`${dayLabel(d.date, today)}: ${ea == null ? 'no food logged' : `${formatNumber(ea)} kcal per kg fat-free mass, ${BAND_WORD[band]}`}. ${detail}`}
          >
            <View style={styles.dayHead}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {dayLabel(d.date, today)}
              </Text>
              {trained ? <Tag label="Training day" /> : null}
              <Text variant="callout" tabular color={ea == null ? 'ink2' : 'ink'}>
                {value}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.line }]}>
              {ea != null ? <View style={[styles.bar, { width: `${Math.max(2, Math.min(100, (Math.max(0, ea) / BAR_MAX) * 100))}%`, backgroundColor: colors.ink2 }]} /> : null}
              {/* Tick marks at the screening cut-offs. */}
              <View style={[styles.tick, { left: `${(EA_CUTOFFS.low / BAR_MAX) * 100}%`, backgroundColor: colors.ink }]} />
              <View style={[styles.tick, { left: `${(EA_CUTOFFS.adequate / BAR_MAX) * 100}%`, backgroundColor: colors.ink }]} />
            </View>
            {detail ? (
              <Text variant="caption" color="ink2">
                {detail}
              </Text>
            ) : null}
          </View>
        );
      })}
      <Text variant="caption" color="ink2" style={styles.body}>
        Marks on each bar show {EA_CUTOFFS.low} and {EA_CUTOFFS.adequate}. Today is left out until it’s over.
      </Text>
    </>
  );
}

function Settings({ first, healthConnected }: { first: string; healthConnected: boolean }) {
  const settings = useFuel((s) => s.settings);
  const bodyweightKg = useFuel((s) => s.bodyweightKg);
  const setSettings = useFuel((s) => s.setSettings);
  const setBodyweight = useFuel((s) => s.setBodyweight);
  const [bf, setBf] = useState(settings.bodyFatPct != null ? String(settings.bodyFatPct) : '');
  const [bw, setBw] = useState(bodyweightKg != null ? String(bodyweightKg) : '');
  const bfNum = bf.trim() ? Number(bf.replace(',', '.')) : null;
  const bfError = bfNum != null && !(bfNum >= 3 && bfNum <= 70) ? 'Enter a number between 3 and 70' : undefined;
  const provider = healthProvider();

  return (
    <>
      <SectionLabel>Your numbers</SectionLabel>
      <View style={[styles.body, { gap: space[3] }]}>
        <TextField
          label="Bodyweight (kg)"
          keyboardType="decimal-pad"
          value={bw}
          onChangeText={setBw}
          onBlur={() => setBodyweight(bw.trim() ? Number(bw.replace(',', '.')) : null)}
          hint="Kept on your phone. Used for fat-free mass and training estimates."
        />
        <TextField
          label="Body fat % (optional)"
          keyboardType="decimal-pad"
          value={bf}
          onChangeText={setBf}
          error={bfError}
          onBlur={() => !bfError && bfNum !== settings.bodyFatPct && void setSettings({ bodyFatPct: bfNum })}
          hint="From a scan or scale if you have one. It makes the result more accurate."
        />
        {settings.bodyFatPct == null ? (
          <Toggle
            label={`Use an estimate (assumes ${ASSUMED_BODY_FAT_PCT}% body fat)`}
            value={settings.useEstimate}
            onChange={(useEstimate) => void setSettings({ useEstimate })}
          />
        ) : null}
      </View>

      <SectionLabel>Where your food comes from</SectionLabel>
      <View style={[styles.body, { gap: space[2] }]}>
        <SegmentedControl
          label="Where your food comes from"
          value={settings.intakeSource === 'spotter' ? 'spotter' : 'auto'}
          onChange={(v) => void setSettings({ intakeSource: v })}
          options={[
            { value: 'auto', label: provider },
            { value: 'spotter', label: 'Logged in Spotter' },
          ]}
        />
        <Text variant="caption" color="ink2">
          {settings.intakeSource === 'spotter'
            ? 'Only food you log in Spotter counts.'
            : `${healthConnected ? 'Recommended while it’s connected. ' : ''}If you log in another app that writes to ${provider}, it’s used here, so you never enter food twice. Days with nothing in ${provider} use Spotter’s log. The two are never added together.`}
        </Text>
      </View>

      <SectionLabel>Sharing</SectionLabel>
      <View style={[styles.body, { gap: space[2] }]}>
        <Toggle label={`Share fuel check level with ${first}`} value={settings.shareWithCoach} onChange={(shareWithCoach) => void setSettings({ shareWithCoach })} />
        <Text variant="caption" color="ink2">
          Off by default. When it’s on, {first} sees the level (for example “Worth watching”) and the signs above in plain words. {first} never sees energy availability
          figures, body fat or bodyweight here. What {first} already sees from your food log stays the same.
        </Text>
      </View>
    </>
  );
}

function HowItWorks({ estimatedNote }: { estimatedNote: string | null }) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.disclosure, { borderTopColor: colors.line }]}
      >
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          How this is worked out
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink2} />
      </Pressable>
      {open ? (
        <View style={[styles.body, { gap: space[2], paddingBottom: space[6] }]}>
          <Text>Energy availability = (food energy − training energy) ÷ fat-free mass, per day.</Text>
          <Text>
            It’s the energy left for everything else your body does after training. Fat-free mass is bodyweight minus body fat.
            {estimatedNote ? ` ${estimatedNote}.` : ''}
          </Text>
          <Text>
            Training energy comes from your watch when it records workouts. Otherwise it’s estimated: about {STRENGTH_MET.moderate} METs for a strength session, {STRENGTH_MET.hard} when
            it felt hard, minus what you’d burn at rest anyway.
          </Text>
          <Text>
            The bands ({EA_CUTOFFS.adequate}+ adequate, {EA_CUTOFFS.low} to {EA_CUTOFFS.adequate} reduced, under {EA_CUTOFFS.low} low) are commonly used screening cut-offs from sports
            science research. They come from population studies, not from you.
          </Text>
          <Text>
            It needs food on at least {FUEL_MIN_LOGGED_DAYS} of the last 14 days. It also looks at cycle changes, pain that keeps coming back, a drop in your estimated max, low-energy
            daily checks and bodyweight change, because those often show up together with under-fuelling.
          </Text>
          <Text color="ink2">
            Limits: logged food usually under-counts what was eaten, and training estimates are rough. Treat this as a prompt to look closer, not a measurement. If it suggests talking to
            someone, a doctor or sports dietitian can check properly.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.toggle, { minHeight: touchMin }]}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.brand, false: colors.line }} thumbColor={colors.surface} {...{ activeThumbColor: colors.surface }} />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingVertical: space[2] },
  bullet: { flexDirection: 'row', gap: space[2] },
  dayRow: { paddingHorizontal: margin, paddingVertical: space[2], gap: space[1], borderBottomWidth: StyleSheet.hairlineWidth },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  bar: { height: 8, borderRadius: 4 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  disclosure: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: margin, minHeight: touchMin, marginTop: space[4], borderTopWidth: StyleSheet.hairlineWidth },
});
