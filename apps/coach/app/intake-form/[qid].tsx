import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MAX_OPTIONS, QUESTION_TYPES, QUESTION_TYPE_LABEL, formProblems, removeQuestion, upsertQuestion, type IntakeQuestion, type QuestionType } from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, Sheet, Text, TextField, useTheme, margin, space } from '@spotter/ui';
import { useIntakeEditor } from '../../src/intakeForm';
import { confirm } from '../../src/confirm';

const isChoice = (t: QuestionType) => t === 'single_choice' || t === 'multi_choice';

/** Edit one intake question. Changes go into the form draft; nothing is saved until "Save form". */
export default function QuestionEditor() {
  const { qid } = useLocalSearchParams<{ qid: string }>();
  const { colors } = useTheme();
  const { draft, edit } = useIntakeEditor();
  const [typeSheet, setTypeSheet] = useState(false);
  const index = draft.questions.findIndex((x) => x.id === qid);
  const q = draft.questions[index];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/intake-form'));

  if (!q) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={back} />
        </View>
        <EmptyState message="This question was removed." actionLabel="Back to the form" onAction={() => router.replace('/intake-form')} />
      </Screen>
    );
  }

  const update = (patch: Partial<IntakeQuestion>) => edit(upsertQuestion(draft, { ...q, ...patch }));
  const problems = formProblems(draft).filter((p) => p.questionId === q.id);
  const options = q.options ?? [];

  const changeType = (type: QuestionType) => {
    setTypeSheet(false);
    const patch: Partial<IntakeQuestion> = { type };
    if (isChoice(type) && !isChoice(q.type)) patch.options = ['', ''];
    if (!isChoice(type)) patch.options = undefined;
    if (type !== 'number') patch.unit = undefined;
    update(patch);
  };

  const remove = () =>
    confirm('Delete this question?', 'Clients who already answered keep their answers. New clients won’t see it.', 'Delete', () => {
      edit(removeQuestion(draft, q.id));
      back();
    });

  return (
    <Screen footer={<Button label="Done" onPress={back} />}>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back to the form" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          Question {index + 1}
        </Text>
        <Text variant="title" accessibilityRole="header" numberOfLines={3}>
          {q.label.trim() || 'New question'}
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Question"
          value={q.label}
          onChangeText={(label) => update({ label })}
          placeholder="e.g. How many hours do you usually sleep?"
          multiline
          error={problems.find((p) => p.detail === 'Needs a question.')?.detail}
          autoFocus={!q.label}
        />
        <TextField
          label="Hint (optional)"
          value={q.help ?? ''}
          onChangeText={(help) => update({ help })}
          placeholder="Shown under the question, e.g. an example answer"
        />
      </View>

      <SectionLabel>Answer</SectionLabel>
      <ListRow title="Answer type" subtitle={QUESTION_TYPE_LABEL[q.type]} chevron onPress={() => setTypeSheet(true)} />
      <View style={[styles.toggle, { borderBottomColor: colors.line }]}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Required</Text>
          <Text variant="callout" color="ink2">
            Clients can’t continue without answering.
          </Text>
        </View>
        <Switch
          value={q.required}
          onValueChange={(required) => update({ required })}
          accessibilityLabel="Required"
          trackColor={{ true: colors.brand, false: colors.line }}
          thumbColor={colors.surface}
          {...{ activeThumbColor: colors.surface }}
        />
      </View>

      {isChoice(q.type) ? (
        <View style={styles.form}>
          <Text variant="label" color="ink2">
            Choices
          </Text>
          {options.map((o, i) => (
            <View key={i} style={styles.option}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={`Choice ${i + 1}`}
                  value={o}
                  onChangeText={(t) => update({ options: options.map((x, j) => (j === i ? t : x)) })}
                />
              </View>
              <IconButton
                icon="x"
                label={`Remove choice ${i + 1}`}
                onPress={() => update({ options: options.filter((_, j) => j !== i) })}
              />
            </View>
          ))}
          {problems
            .filter((p) => p.detail.includes('choice'))
            .map((p) => (
              <Text key={p.detail} variant="caption" color="error">
                {p.detail}
              </Text>
            ))}
          <Button
            label="Add a choice"
            kind="quiet"
            icon="plus"
            full={false}
            onPress={() => update({ options: [...options, ''] })}
            disabled={options.length >= MAX_OPTIONS}
            disabledReason={`Up to ${MAX_OPTIONS} choices.`}
          />
        </View>
      ) : null}

      {q.type === 'number' ? (
        <View style={styles.form}>
          <TextField label="Unit (optional)" value={q.unit ?? ''} onChangeText={(unit) => update({ unit })} placeholder="e.g. kg, cm, years" autoCapitalize="none" />
        </View>
      ) : null}

      <View style={[styles.form, { paddingTop: space[8] }]}>
        <Button label="Delete question" kind="quiet" icon="trash-2" onPress={remove} />
      </View>

      <Sheet visible={typeSheet} title="Answer type" onClose={() => setTypeSheet(false)}>
        {QUESTION_TYPES.map((t, i) => (
          <ListRow
            key={t}
            title={QUESTION_TYPE_LABEL[t]}
            right={t === q.type ? <Text variant="bodyStrong" style={{ color: colors.brand }}>Current</Text> : undefined}
            last={i === QUESTION_TYPES.length - 1}
            onPress={() => changeType(t)}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  form: { paddingHorizontal: margin, paddingTop: space[4], gap: space[3] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  option: { flexDirection: 'row', alignItems: 'flex-end', gap: space[1] },
});
