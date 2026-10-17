import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button, SectionLabel, SegmentedControl, Text, TextField, useTheme, margin, space, Screen } from '@spotter/ui';
import { tenant } from '../../src/env';
import { kv } from '../../src/storage';
import { useApp } from '../../src/store';

/*
 * Default intake form (C-2). Tenants can configure their own; this is the fallback schema.
 * Kept to required fields plus two optional ones so the whole flow fits in ~3 minutes (UX finding C1).
 * PAR-Q questions are paraphrased in plain language. CLIENT INPUT REQUIRED: confirm wording per launch market.
 */
const PARQ = [
  'Has a doctor ever said you have a heart condition or high blood pressure?',
  'Do you get chest pain at rest, in daily life, or when you exercise?',
  'Have you lost your balance from dizziness, or passed out, in the last 12 months?',
  'Have you been diagnosed with another long-term medical condition?',
  'Are you taking prescribed medication for a long-term condition?',
  'Do you have a bone, joint or muscle problem that more activity could make worse?',
  'Has a doctor said you should only exercise under medical supervision?',
] as const;

type YesNo = 'yes' | 'no';
interface Draft {
  goal: string | null;
  days: string | null;
  equipment: string | null;
  history: string;
  injuries: string;
  parq: (YesNo | null)[];
}
const EMPTY: Draft = { goal: null, days: null, equipment: null, history: '', injuries: '', parq: PARQ.map(() => null) };
const DRAFT_KEY = 'spotter.intakeDraft';

export default function Intake() {
  const { colors } = useTheme();
  const submitIntake = useApp((s) => s.submitIntake);
  const [d, setD] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const firstName = tenant.coach.name.split(' ')[0];

  // Partial answers survive leaving the app (resume later).
  useEffect(() => {
    void kv.getItem(DRAFT_KEY).then((raw) => {
      if (raw) setD({ ...EMPTY, ...(JSON.parse(raw) as Draft) });
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (loaded) void kv.setItem(DRAFT_KEY, JSON.stringify(d));
  }, [d, loaded]);

  const parqFlag = d.parq.some((a) => a === 'yes');
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!d.goal) m.push('your main goal');
    if (!d.days) m.push('days per week');
    if (!d.equipment) m.push('equipment');
    const unanswered = d.parq.filter((a) => a == null).length;
    if (unanswered) m.push(`${unanswered} health question${unanswered === 1 ? '' : 's'}`);
    return m;
  }, [d]);

  const save = async () => {
    setSaving(true);
    await submitIntake({ ...d }, parqFlag);
    await kv.removeItem(DRAFT_KEY);
    router.push('/waiver');
  };

  return (
    <Screen
      footer={
        <Button
          label="Save and continue"
          onPress={save}
          loading={saving}
          disabled={missing.length > 0}
          disabledReason={missing.length ? `Still needed: ${missing.join(', ')}` : undefined}
        />
      }
    >
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          Step 1 of 2 · about 2 minutes
        </Text>
        <Text variant="title" accessibilityRole="header">
          About your training
        </Text>
        <Text color="ink2">{firstName} uses this to set up your first block. You can change answers later.</Text>
      </View>

      <View style={styles.form}>
        <Field label="Main goal">
          <SegmentedControl
            label="Main goal"
            value={d.goal}
            onChange={(goal) => setD({ ...d, goal })}
            options={[
              { value: 'strength', label: 'Strength' },
              { value: 'muscle', label: 'Muscle' },
              { value: 'fat_loss', label: 'Fat loss' },
              { value: 'general', label: 'General' },
            ]}
          />
        </Field>
        <Field label="Days per week you can train">
          <SegmentedControl
            label="Days per week"
            value={d.days}
            onChange={(days) => setD({ ...d, days })}
            options={['2', '3', '4', '5'].map((v) => ({ value: v, label: v }))}
          />
        </Field>
        <Field label="Where you train">
          <SegmentedControl
            label="Equipment"
            value={d.equipment}
            onChange={(equipment) => setD({ ...d, equipment })}
            options={[
              { value: 'full_gym', label: 'Full gym' },
              { value: 'home_gym', label: 'Home gym' },
              { value: 'dumbbells', label: 'Dumbbells' },
            ]}
          />
        </Field>
        <TextField
          label="Training so far (optional)"
          placeholder="e.g. 2 years of lifting, mostly machines"
          value={d.history}
          onChangeText={(history) => setD({ ...d, history })}
          multiline
        />
        <TextField
          label="Injuries or pain (optional)"
          placeholder="e.g. left knee aches on deep squats"
          value={d.injuries}
          onChangeText={(injuries) => setD({ ...d, injuries })}
          multiline
        />
      </View>

      <SectionLabel>Health questions (PAR-Q)</SectionLabel>
      <View style={styles.form}>
        {PARQ.map((q, i) => (
          <View key={q} style={styles.q}>
            <Text>{q}</Text>
            <SegmentedControl
              label={q}
              value={d.parq[i] ?? null}
              onChange={(v) => setD({ ...d, parq: d.parq.map((a, j) => (j === i ? v : a)) })}
              options={[
                { value: 'no', label: 'No' },
                { value: 'yes', label: 'Yes' },
              ]}
            />
          </View>
        ))}
        {parqFlag ? (
          <View accessibilityRole="alert" style={[styles.flag, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]}>
            <Feather name="info" size={18} color={colors.warning} />
            <Text style={{ flex: 1 }}>
              Thanks for telling us. {firstName} will see this before your first session. If you haven’t already, check with a
              doctor before training hard. You can keep going with the setup.
            </Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="label" color="ink2">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: margin, paddingTop: space[6], gap: space[2] },
  form: { paddingHorizontal: margin, paddingTop: space[5], gap: space[5] },
  q: { gap: space[2] },
  flag: { flexDirection: 'row', gap: space[3], padding: space[4], borderLeftWidth: 3, borderRadius: 6 },
});
