import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { PARQ_QUESTIONS, type Answers } from '@spotter/core';
import { Banner, Button, IconButton, IntakeQuestionField, Screen, SectionLabel, Text, margin, space } from '@spotter/ui';
import { tenant } from '../../src/env';
import { useIntakeEditor } from '../../src/intakeForm';

/** The client's intake exactly as it will render, using the same component as the client app. Answers here aren't kept. */
export default function IntakePreview() {
  const draft = useIntakeEditor((s) => s.draft);
  const dirty = useIntakeEditor((s) => s.dirty);
  const [answers, setAnswers] = useState<Answers>({});
  const set = (id: string) => (v: Answers[string]) => setAnswers((a) => ({ ...a, [id]: v }));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/intake-form'));

  return (
    <Screen
      banner={<Banner message={dirty ? 'Preview of your unsaved changes. Answers here aren’t kept.' : 'Preview. Answers here aren’t kept.'} />}
      footer={<Button label="Back to editing" kind="secondary" onPress={back} />}
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back to editing" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          Step 1 of 2
        </Text>
        <Text variant="title" accessibilityRole="header">
          About your training
        </Text>
        <Text color="ink2">{tenant.coach.name.split(' ')[0]} uses this to set up your first block. You can change answers later.</Text>
      </View>
      <View style={styles.form}>
        {draft.questions.map((q) =>
          q.label.trim() ? <IntakeQuestionField key={q.id} q={q} value={answers[q.id]} onChange={set(q.id)} /> : null,
        )}
      </View>
      <SectionLabel>Health questions (PAR-Q)</SectionLabel>
      <View style={styles.form}>
        {PARQ_QUESTIONS.map((q) => (
          <IntakeQuestionField key={q.id} q={q} value={answers[q.id]} onChange={set(q.id)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  form: { paddingHorizontal: margin, paddingTop: space[5], gap: space[5] },
});
