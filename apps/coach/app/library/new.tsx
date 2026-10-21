import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ExerciseMetric } from '@spotter/core';
import { Button, IconButton, Screen, SegmentedControl, Text, TextField, useToast, margin, space } from '@spotter/ui';
import { usePrograms } from '../../src/programs';
import { METRIC_OPTIONS } from '../../src/programUi';

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** Add a coach's own exercise to their library (K-4). */
export default function NewExercise() {
  const params = useLocalSearchParams<{ name?: string }>();
  const toast = useToast();
  const add = usePrograms((s) => s.addCustomExercise);
  const [name, setName] = useState(params.name ?? '');
  const [metric, setMetric] = useState<ExerciseMetric>('weight_reps');
  const [tags, setTags] = useState('');
  const [equipment, setEquipment] = useState('');
  const missing = !name.trim() ? 'Give it a name.' : undefined;

  return (
    <Screen
      footer={
        <Button
          label="Add to my library"
          disabled={!!missing}
          disabledReason={missing}
          onPress={() => {
            const ex = add({ name: name.trim(), metric, tags: list(tags), equipment: list(equipment), demoVideo: null });
            toast({ message: `${ex.name} added. You can use it in any program.` });
            router.back();
          }}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/programs'))} />
      </View>
      <View style={styles.body}>
        <Text variant="title" accessibilityRole="header">
          Your own exercise
        </Text>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Landmine Press" autoFocus={!name} />
        <View style={{ gap: space[2] }}>
          <Text variant="label" color="ink2">
            Clients log
          </Text>
          <SegmentedControl label="Clients log" value={metric} onChange={setMetric} options={METRIC_OPTIONS} />
        </View>
        <TextField label="Tags (optional)" value={tags} onChangeText={setTags} placeholder="e.g. push, shoulders" hint="Separate with commas." autoCapitalize="none" />
        <TextField label="Equipment (optional)" value={equipment} onChangeText={setEquipment} placeholder="e.g. barbell, landmine" hint="Separate with commas." autoCapitalize="none" />
        <Text variant="callout" color="ink2">
          Add a demo video afterwards from the library, or match several at once with Match videos.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  body: { paddingHorizontal: margin, gap: space[4] },
});
