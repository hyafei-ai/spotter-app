import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import { matchVideos, type VideoMatch } from '@spotter/core';
import { Banner, Button, IconButton, ListRow, Screen, SectionLabel, Text, useTheme, useToast, margin, space } from '@spotter/ui';
import { useLibrary, usePrograms } from '../../src/programs';
import { ExercisePicker } from '../../src/programUi';

/**
 * Bulk demo-video upload (K-4): pick many files, Spotter proposes an exercise for each from the file
 * name, the coach confirms or changes them. Files that don't match clearly are left for the coach.
 */
export default function MatchVideos() {
  const { colors } = useTheme();
  const toast = useToast();
  const library = useLibrary();
  const setDemoVideos = usePrograms((s) => s.setDemoVideos);
  const [matches, setMatches] = useState<VideoMatch[]>([]);
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/programs'));
  const byId = new Map(library.map((e) => [e.id, e]));
  const ready = matches.filter((m) => m.exerciseId);

  const pick = async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'video/*', multiple: true, copyToCacheDirectory: false });
      if (res.canceled) return;
      setMatches(matchVideos(res.assets.map((a) => a.name), library));
    } catch {
      setError('Couldn’t open your files. Check that Spotter can access them, then try again.');
    }
  };

  const attach = () => {
    // MOCK: records file names only; real builds upload each file with tus to Storage and create a Mux asset.
    setDemoVideos(ready.map((m) => ({ exerciseId: m.exerciseId!, fileName: m.fileName })));
    toast({ message: `${ready.length} demo video${ready.length === 1 ? '' : 's'} attached.` });
    back();
  };

  return (
    <Screen
      banner={error ? <Banner tone="error" message={error} actionLabel="Try again" onAction={() => void pick()} /> : undefined}
      footer={
        matches.length ? (
          <Button
            label={`Attach ${ready.length} video${ready.length === 1 ? '' : 's'}`}
            onPress={attach}
            disabled={ready.length === 0}
            disabledReason="Choose an exercise for at least one file."
          />
        ) : (
          <Button label="Choose videos" icon="film" onPress={() => void pick()} />
        )
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Match demo videos
        </Text>
        <Text color="ink2">Pick your videos. Name files after the exercise (e.g. “back-squat.mp4”) and they’re matched for you; you confirm before anything is attached.</Text>
      </View>
      {matches.length ? (
        <>
          <SectionLabel right={<Text variant="caption" color="ink2">{`${ready.length} of ${matches.length} matched`}</Text>}>Files</SectionLabel>
          {matches.map((m, i) => {
            const ex = m.exerciseId ? byId.get(m.exerciseId) : null;
            return (
              <ListRow
                key={`${m.fileName}-${i}`}
                left={<Feather name={ex ? 'check-circle' : 'help-circle'} size={20} color={ex ? colors.success : colors.warning} />}
                title={m.fileName}
                reason={ex ? undefined : m.ambiguousWith.length ? `Could be ${m.ambiguousWith.map((x) => byId.get(x)?.name).join(' or ')}` : 'No clear match'}
                subtitle={ex ? `→ ${ex.name}` : 'Tap to choose the exercise'}
                chevron
                last={i === matches.length - 1}
                onPress={() => setChoosingFor(m.fileName)}
              />
            );
          })}
          <View style={styles.head}>
            <Button label="Choose different videos" kind="quiet" onPress={() => void pick()} />
          </View>
        </>
      ) : null}
      <ExercisePicker
        visible={choosingFor != null}
        title={choosingFor ? `Which exercise is “${choosingFor}”?` : ''}
        library={library}
        onClose={() => setChoosingFor(null)}
        onPick={(ex) => {
          setMatches((ms) => ms.map((m) => (m.fileName === choosingFor ? { ...m, exerciseId: ex.id, score: 1, ambiguousWith: [] } : m)));
          setChoosingFor(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, paddingTop: space[2], gap: space[2] },
});
