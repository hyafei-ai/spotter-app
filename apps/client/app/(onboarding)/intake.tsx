import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { PARQ_QUESTIONS, missingAnswers, parqFlag, pruneAnswers, type Answers, type IntakeForm } from '@spotter/core';
import { Button, IntakeQuestionField, Screen, SectionLabel, Skeleton, Text, useTheme, margin, space } from '@spotter/ui';
import { tenant } from '../../src/env';
import { kv } from '../../src/storage';
import { loadIntakeForm } from '../../src/intakeForm';
import { useApp } from '../../src/store';

/**
 * Intake (C-2), rendered from the trainer's own form. The PAR-Q block is fixed and always last.
 * Kept short so the whole flow fits in ~3 minutes (UX finding C1).
 */
const DRAFT_KEY = 'spotter.intakeDraft';

function estimate(form: IntakeForm): string {
  // Roughly 10 s per choice question, 25 s per written answer, plus the PAR-Q block.
  const s = form.questions.reduce((t, q) => t + (q.type === 'long_text' || q.type === 'short_text' ? 25 : 10), 40);
  const min = Math.max(1, Math.round(s / 60));
  return `about ${min} minute${min === 1 ? '' : 's'}`;
}

export default function Intake() {
  const { colors } = useTheme();
  const submitIntake = useApp((s) => s.submitIntake);
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const firstName = tenant.coach.name.split(' ')[0];

  // Load the form, then any partial answers (resume later), dropping answers to removed questions.
  useEffect(() => {
    void (async () => {
      const f = await loadIntakeForm();
      const raw = await kv.getItem(DRAFT_KEY);
      setAnswers(raw ? pruneAnswers(f, JSON.parse(raw) as Answers) : {});
      setForm(f);
    })();
  }, []);
  useEffect(() => {
    if (form) void kv.setItem(DRAFT_KEY, JSON.stringify(answers));
  }, [answers, form]);

  const missing = useMemo(() => (form ? missingAnswers(form, answers) : []), [form, answers]);
  const missingIds = new Set(missing.map((q) => q.id));
  const flagged = parqFlag(answers);

  if (!form) {
    return (
      <Screen>
        <View style={[styles.head, { gap: space[3] }]}>
          <Skeleton width="40%" />
          <Skeleton width="70%" height={28} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={52} />
          ))}
        </View>
      </Screen>
    );
  }

  const set = (id: string) => (v: Answers[string]) => setAnswers((a) => ({ ...a, [id]: v }));

  const save = async () => {
    setTried(true);
    if (missing.length) return;
    setSaving(true);
    await submitIntake(form, answers, flagged);
    await kv.removeItem(DRAFT_KEY);
    router.push('/waiver');
  };

  const missingText = (() => {
    const parq = missing.filter((q) => q.id.startsWith('parq_')).length;
    const other = missing.filter((q) => !q.id.startsWith('parq_')).map((q) => q.label.toLowerCase());
    const parts = [...other.slice(0, 3)];
    if (other.length > 3) parts.push(`${other.length - 3} more`);
    if (parq) parts.push(`${parq} health question${parq === 1 ? '' : 's'}`);
    return parts.join(', ');
  })();

  return (
    <Screen
      footer={
        <Button
          label="Save and continue"
          onPress={save}
          loading={saving}
          disabled={missing.length > 0 && tried}
          disabledReason={missing.length ? `Still needed: ${missingText}` : undefined}
        />
      }
    >
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          Step 1 of 2 · {estimate(form)}
        </Text>
        <Text variant="title" accessibilityRole="header">
          About your training
        </Text>
        <Text color="ink2">{firstName} uses this to set up your first block. You can change answers later.</Text>
      </View>

      <View style={styles.form}>
        {form.questions.map((q) => (
          <IntakeQuestionField key={q.id} q={q} value={answers[q.id]} onChange={set(q.id)} showError={tried && missingIds.has(q.id)} />
        ))}
      </View>

      <SectionLabel>Health questions (PAR-Q)</SectionLabel>
      <View style={styles.form}>
        {PARQ_QUESTIONS.map((q) => (
          <IntakeQuestionField key={q.id} q={q} value={answers[q.id]} onChange={set(q.id)} showError={tried && missingIds.has(q.id)} />
        ))}
        {flagged ? (
          <View accessibilityRole="alert" style={[styles.flag, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]}>
            <Feather name="info" size={18} color={colors.warning} />
            <Text style={{ flex: 1 }}>
              Thanks for telling us. {firstName} will see this before your first session. If you haven’t already, check with a doctor
              before training hard. You can keep going with the setup.
            </Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: margin, paddingTop: space[6], gap: space[2] },
  form: { paddingHorizontal: margin, paddingTop: space[5], gap: space[5] },
  flag: { flexDirection: 'row', gap: space[3], padding: space[4], borderLeftWidth: 3, borderRadius: 6 },
});
