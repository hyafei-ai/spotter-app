import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { allTemplates, blocksFromTemplate, type TemplateCategory, type TemplateWorkout } from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, Tag, Text, TextField, useTheme, margin, space } from '@spotter/ui';
import { Chips } from '../src/programUi';
import { BlocksPreview } from '../src/multisport/ui';
import { DestinationFooter, strengthNames } from '../src/multisport/destination';
import { useStyleProfile } from '../src/multisport/styles';

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  benchmark: 'Benchmarks',
  race_sim: 'Race simulations',
  running: 'Running and ergs',
  conditioning: 'Conditioning',
  skill: 'Skill',
  assessment: 'Tests',
};

/** Race sims come in 24 combinations; the list shows singles and finds doubles and relay by search. */
const listed = (t: TemplateWorkout) => !/^race\.(full|half)\.(doubles|relay)\./.test(t.id);

/**
 * Templates (docs/ux/multisport.md 5.6): pick a proven workout, check it (every race number to verify says so),
 * add it, then adapt it in the day like anything else.
 */
export default function Templates() {
  const { program, day } = useLocalSearchParams<{ program?: string; day?: string }>();
  const { colors } = useTheme();
  const profile = useStyleProfile();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const [picked, setPicked] = useState<TemplateWorkout | null>(null);
  const all = useMemo(() => allTemplates(), []);
  const q = query.trim().toLowerCase();
  const results = all.filter((t) => (q ? `${t.label} ${t.name} ${t.summary}`.toLowerCase().includes(q) : listed(t)) && (!category || t.category === category));
  const cats = profile.templateOrder.filter((c) => all.some((t) => t.category === c));
  const preview = useMemo(() => (picked ? blocksFromTemplate(picked) : null), [picked]);
  const back = () => (picked ? setPicked(null) : router.canGoBack() ? router.back() : router.replace('/programs'));

  if (picked && preview) {
    return (
      <Screen footer={<DestinationFooter programKey={program} dayId={day} title={picked.name} input={preview} />}>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back to templates" onPress={back} />
        </View>
        <View style={styles.head}>
          <Text variant="label" color="ink2">
            {CATEGORY_LABEL[picked.category]}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {picked.label}
          </Text>
          <Text variant="callout" color="ink2">
            {picked.summary}
          </Text>
        </View>
        {picked.verify.length ? (
          <View style={[styles.warn, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]} accessibilityRole="alert">
            <Text variant="label" color="ink2">
              Check before you send
            </Text>
            {picked.verify.map((v) => (
              <Text key={v} variant="callout">
                {v}
              </Text>
            ))}
          </View>
        ) : null}
        <SectionLabel>What the client gets</SectionLabel>
        <BlocksPreview blocks={preview.blocks} strengthNames={strengthNames(preview)} verifyNote={!picked.verify.length} />
        <Text variant="caption" color="ink2" style={styles.body}>
          Change loads, rounds or movements after adding it, like any other part.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Templates
        </Text>
        <TextField label="Search templates" value={query} onChangeText={setQuery} placeholder="e.g. Fran, 400 m, race sim, doubles" autoCorrect={false} />
      </View>
      <Chips label="Category" options={cats.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} value={category} onChange={setCategory} />
      {results.length === 0 ? (
        <EmptyState message={`Nothing called “${query}”. Paste it instead.`} actionLabel="Paste a workout" onAction={() => router.replace(`/paste${program ? `?program=${encodeURIComponent(program)}&day=${day}` : ''}`)} />
      ) : (
        cats
          .filter((c) => results.some((t) => t.category === c))
          .map((c) => {
            const rows = results.filter((t) => t.category === c);
            return (
              <View key={c}>
                <SectionLabel>{CATEGORY_LABEL[c]}</SectionLabel>
                {rows.map((t, i) => (
                  <ListRow
                    key={t.id}
                    title={t.label}
                    subtitle={t.summary}
                    right={t.verify.length ? <Tag label="Check standard" tone="warning" /> : undefined}
                    chevron
                    last={i === rows.length - 1}
                    onPress={() => setPicked(t)}
                  />
                ))}
              </View>
            );
          })
      )}
      {!q ? (
        <Text variant="caption" color="ink2" style={styles.body}>
          Doubles and relay race simulations: search “doubles” or “relay”.
        </Text>
      ) : null}
      <View style={styles.body}>
        <Button label="Paste a workout instead" kind="quiet" icon="clipboard" onPress={() => router.replace(`/paste${program ? `?program=${encodeURIComponent(program)}&day=${day}` : ''}`)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
  warn: { marginHorizontal: margin, marginTop: space[3], padding: space[3], borderLeftWidth: 3, borderRadius: 6, gap: 4 },
});
