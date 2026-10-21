import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, SegmentedControl, Tag, Text, TextField, useToast, margin, space } from '@spotter/ui';
import { useLibrary, usePrograms } from '../../src/programs';
import { METRIC_OPTIONS } from '../../src/programUi';

/** One library exercise. Built-ins are read-only apart from the coach's demo video; the coach's own are editable. */
export default function LibraryExercise() {
  const { exId } = useLocalSearchParams<{ exId: string }>();
  const toast = useToast();
  const library = useLibrary();
  const { updateCustomExercise, setDemoVideos, programs } = usePrograms();
  const ex = library.find((e) => e.id === exId);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/programs'));

  if (!ex) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={back} />
        </View>
        <EmptyState message="This exercise isn’t in your library." actionLabel="Back to the library" onAction={back} />
      </Screen>
    );
  }

  const usedIn = programs.filter((p) => p.weeks.some((w) => w.days.some((d) => d.exercises.some((e) => e.exerciseId === ex.id))));

  const pickVideo = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: false });
    if (res.canceled || !res.assets[0]) return;
    // MOCK: stores the file name; the real upload goes through POST /videos/upload-url (resumable) to Mux.
    setDemoVideos([{ exerciseId: ex.id, fileName: res.assets[0].name }]);
    toast({ message: 'Demo video attached.' });
  };

  return (
    <Screen footer={<Button label="Done" onPress={back} />}>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back to the library" onPress={back} />
      </View>
      <View style={styles.body}>
        <View style={{ flexDirection: 'row', gap: space[1] }}>{ex.isCustom ? <Tag label="Yours" /> : <Tag label="Starter library" />}</View>
        {ex.isCustom ? (
          <>
            <TextField label="Name" value={ex.name} onChangeText={(name) => updateCustomExercise({ ...ex, name: name || ex.name })} />
            <View style={{ gap: space[2] }}>
              <Text variant="label" color="ink2">
                Clients log
              </Text>
              <SegmentedControl label="Clients log" value={ex.metric} onChange={(metric) => updateCustomExercise({ ...ex, metric })} options={METRIC_OPTIONS} />
            </View>
          </>
        ) : (
          <>
            <Text variant="title" accessibilityRole="header">
              {ex.name}
            </Text>
            <Text color="ink2">{METRIC_OPTIONS.find((m) => m.value === ex.metric)?.label}</Text>
          </>
        )}
        <Text variant="callout" color="ink2">
          {[ex.tags.join(', '), ex.equipment.join(', ')].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <SectionLabel>Demo video</SectionLabel>
      <View style={styles.body}>
        <Text color={ex.demoVideo ? 'ink' : 'ink2'}>{ex.demoVideo ?? 'None yet. Clients see your video one tap from the set row.'}</Text>
        <Button label={ex.demoVideo ? 'Replace video' : 'Add a video'} icon="film" kind="secondary" onPress={() => void pickVideo()} />
      </View>

      <SectionLabel>{usedIn.length ? `Used in ${usedIn.length} program${usedIn.length === 1 ? '' : 's'}` : 'Not used in a program yet'}</SectionLabel>
      {usedIn.map((p, i) => (
        <ListRow key={p.id} title={p.name} chevron last={i === usedIn.length - 1} onPress={() => router.push(`/program/${p.id}`)} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[2], gap: space[3] },
});
