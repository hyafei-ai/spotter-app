import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  MAX_QUESTIONS,
  PARQ_QUESTIONS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  formProblems,
  moveQuestion,
  newQuestion,
  upsertQuestion,
  type QuestionType,
} from '@spotter/core';
import { Button, IconButton, ListRow, Screen, SectionLabel, Sheet, Text, useTheme, useToast, margin, space } from '@spotter/ui';
import { useIntakeEditor } from '../../src/intakeForm';
import { confirm } from '../../src/confirm';

const TYPE_HINT: Record<QuestionType, string> = {
  short_text: 'A name, a sport, a few words',
  long_text: 'Anything that needs a sentence or two',
  single_choice: 'One answer from a list',
  multi_choice: 'Any number of answers from a list',
  yes_no: 'A quick yes or no',
  number: 'Height, bodyweight, years training',
};

/** Coach edits the questions new clients answer at sign-up (C-2, configurable per tenant). */
export default function IntakeFormEditor() {
  const { colors } = useTheme();
  const toast = useToast();
  const { draft, dirty, edit, save, discard, resetToStarter } = useIntakeEditor();
  const [adding, setAdding] = useState(false);
  const problems = formProblems(draft);
  const byQuestion = new Map<string, string>();
  for (const p of problems) if (p.questionId && !byQuestion.has(p.questionId)) byQuestion.set(p.questionId, p.detail);

  const leave = () => {
    const go = () => (router.canGoBack() ? router.back() : router.replace('/me'));
    if (!dirty) return go();
    confirm('Discard changes?', 'Your edits to the intake form haven’t been saved.', 'Discard', () => {
      discard();
      go();
    });
  };

  const add = (type: QuestionType) => {
    const q = newQuestion(type, draft);
    edit(upsertQuestion(draft, q));
    setAdding(false);
    router.push(`/intake-form/${q.id}`);
  };

  const onSave = () => {
    const saved = save();
    if (saved) toast({ message: 'Saved. New clients will see this form.' });
  };

  return (
    <Screen
      footer={
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <Button label="Preview" kind="secondary" icon="eye" onPress={() => router.push('/intake-form/preview')} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              label="Save form"
              onPress={onSave}
              disabled={!dirty || problems.length > 0}
              disabledReason={problems.length ? problems[0]!.message : !dirty ? 'No changes yet' : undefined}
            />
          </View>
        </View>
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={leave} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Intake form
        </Text>
        <Text color="ink2">What new clients answer before their first session. Keep it short; you can always ask more in a message.</Text>
      </View>

      <SectionLabel right={<Text variant="caption" color="ink2">{`${draft.questions.length} of ${MAX_QUESTIONS}`}</Text>}>Your questions</SectionLabel>
      {draft.questions.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          No questions of your own yet. Clients will only answer the health check.
        </Text>
      ) : (
        draft.questions.map((q, i) => {
          const problem = byQuestion.get(q.id);
          return (
            <View key={q.id} style={[styles.row, { borderBottomColor: colors.line }]}>
              <Text variant="figure" color="ink2" style={styles.num}>
                {i + 1}
              </Text>
              <Pressable
                style={styles.rowText}
                accessibilityRole="button"
                accessibilityLabel={`Edit question ${i + 1}: ${q.label || 'untitled'}`}
                onPress={() => router.push(`/intake-form/${q.id}`)}
              >
                <Text variant="bodyStrong" color={q.label.trim() ? 'ink' : 'ink2'} numberOfLines={3}>
                  {q.label.trim() || 'Untitled question'}
                </Text>
                <Text variant="callout" color="ink2">
                  {QUESTION_TYPE_LABEL[q.type]} · {q.required ? 'Required' : 'Optional'}
                  {q.options?.length ? ` · ${q.options.filter(Boolean).length} choices` : ''}
                </Text>
                {problem ? (
                  <View style={styles.problem}>
                    <Feather name="alert-circle" size={14} color={colors.error} />
                    <Text variant="caption" color="error">
                      {problem}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <View style={styles.moves}>
                {i > 0 ? <IconButton icon="arrow-up" label={`Move question ${i + 1} up`} onPress={() => edit(moveQuestion(draft, q.id, -1))} /> : <View style={styles.slot} />}
                {i < draft.questions.length - 1 ? (
                  <IconButton icon="arrow-down" label={`Move question ${i + 1} down`} onPress={() => edit(moveQuestion(draft, q.id, 1))} />
                ) : (
                  <View style={styles.slot} />
                )}
              </View>
            </View>
          );
        })
      )}
      <View style={styles.body}>
        <Button
          label="Add a question"
          kind="secondary"
          icon="plus"
          onPress={() => setAdding(true)}
          disabled={draft.questions.length >= MAX_QUESTIONS}
          disabledReason={`Forms are capped at ${MAX_QUESTIONS} questions.`}
        />
      </View>

      <SectionLabel>Health check · always included</SectionLabel>
      <ListRow
        left={<Feather name="lock" size={18} color={colors.ink2} />}
        title={`${PARQ_QUESTIONS.length} PAR-Q questions`}
        subtitle="Every client answers these last. Any “yes” flags them for you and suggests they check with a doctor. They can’t be removed or edited."
        last
      />

      <View style={[styles.body, { paddingTop: space[6] }]}>
        <Button
          label="Start again from the starter form"
          kind="quiet"
          onPress={() => confirm('Use the starter form?', 'This replaces your questions with Spotter’s five starter questions. Nothing is saved until you tap Save form.', 'Replace', resetToStarter)}
        />
      </View>

      <Sheet visible={adding} title="Add a question" onClose={() => setAdding(false)}>
        {QUESTION_TYPES.map((t, i) => (
          <ListRow key={t} title={QUESTION_TYPE_LABEL[t]} subtitle={TYPE_HINT[t]} chevron last={i === QUESTION_TYPES.length - 1} onPress={() => add(t)} />
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[4] },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: margin, paddingRight: space[2], paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, gap: space[3] },
  num: { width: 24, paddingTop: 2 },
  rowText: { flex: 1, gap: 2, minHeight: 48, justifyContent: 'center' },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: 2 },
  moves: { flexDirection: 'row' },
  slot: { width: 48 },
  footerRow: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
});
