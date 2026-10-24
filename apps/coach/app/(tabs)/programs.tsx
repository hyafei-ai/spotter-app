import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { programSummary, searchLibrary, type Program } from '@spotter/core';
import { Button, EmptyState, ListRow, Screen, ScreenHeader, SectionLabel, SegmentedControl, Tag, Text, TextField, useTheme, margin, radius, space } from '@spotter/ui';
import { assignedCount, useLibrary, usePrograms } from '../../src/programs';
import { Chips } from '../../src/programUi';
import { useStyles } from '../../src/multisport/styles';

/** K-4 Programs tab: the coach's programs and templates, and their exercise library. */
export default function Programs() {
  const [tab, setTab] = useState<'programs' | 'library'>('programs');
  return (
    <Screen>
      <ScreenHeader title="Programs" />
      <View style={styles.seg}>
        <SegmentedControl
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'programs', label: 'Programs' },
            { value: 'library', label: 'Exercise library' },
          ]}
        />
      </View>
      {tab === 'programs' ? <ProgramList /> : <Library />}
    </Screen>
  );
}

function ProgramList() {
  const { programs: all, assignments, createProgram } = usePrograms();
  // "Single sessions" holders (sessions sent one date at a time) aren't programs to edit; they show on each client.
  const programs = all.filter((p) => p.weeks.length > 0 || p.status !== 'published');
  // Grouped by what the coach needs to know: not visible yet, followed by clients now, or ready to assign.
  const drafts = programs.filter((p) => p.status === 'draft');
  const live = programs.filter((p) => p.status === 'published' && assignedCount(assignments, p.id) > 0);
  const templates = programs.filter((p) => p.status === 'published' && assignedCount(assignments, p.id) === 0);

  const create = () => router.push(`/program/${createProgram()}`);

  const row = (p: Program, i: number, list: Program[]) => {
    const n = assignedCount(assignments, p.id);
    return (
      <ListRow
        key={p.id}
        title={p.name || 'Untitled program'}
        subtitle={`${programSummary(p)}${n ? ` · assigned to ${n}` : ''}`}
        right={
          p.source === 'ai_draft' ? <Tag label="AI draft" tone="brand" /> : p.status === 'draft' ? <Tag label="Draft" /> : p.isTemplate ? <Tag label="Template" /> : undefined
        }
        chevron
        last={i === list.length - 1}
        onPress={() => router.push(`/program/${p.id}`)}
      />
    );
  };

  const quick = (
    <View style={styles.actions}>
      <View style={{ flex: 1 }}>
        <Button label="Paste a workout" icon="clipboard" kind="secondary" onPress={() => router.push('/paste')} accessibilityHint="Turn whiteboard text into a session and send it to a client" />
      </View>
      <View style={{ flex: 1 }}>
        <Button label="Templates" icon="book-open" kind="secondary" onPress={() => router.push('/templates')} accessibilityHint="Benchmarks, race simulations and runs" />
      </View>
    </View>
  );

  if (programs.length === 0) {
    return (
      <>
        <StylesCard />
        {quick}
        <EmptyState message="No programs yet. Build your first one and assign it to a client." actionLabel="New program" onAction={create} />
      </>
    );
  }
  return (
    <>
      <StylesCard />
      {quick}
      {drafts.length ? (
        <>
          <SectionLabel>Drafts · not visible to clients</SectionLabel>
          {drafts.map(row)}
        </>
      ) : null}
      {live.length ? (
        <>
          <SectionLabel>In use</SectionLabel>
          {live.map(row)}
        </>
      ) : null}
      {templates.length ? (
        <>
          <SectionLabel>Ready to assign</SectionLabel>
          {templates.map(row)}
        </>
      ) : null}
      <View style={styles.body}>
        <Button label="New program" icon="plus" kind="secondary" onPress={create} />
      </View>
    </>
  );
}

/** Asked once, where it pays off; skippable (docs/ux/multisport.md section 6). */
function StylesCard() {
  const { colors } = useTheme();
  const answered = useStyles((s) => s.answered);
  const skip = useStyles((s) => s.skip);
  if (answered) return null;
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <Text variant="bodyStrong">How do you coach?</Text>
      <Text variant="callout" color="ink2">
        Strength, hybrid and race-format, WODs, endurance or general fitness. Your styles come first when you build. Nothing is hidden either way.
      </Text>
      <View style={styles.cardRow}>
        <Button label="Choose" kind="secondary" full={false} onPress={() => router.push('/styles')} />
        <Button label="Not now" kind="quiet" full={false} onPress={skip} />
      </View>
    </View>
  );
}

function Library() {
  const library = useLibrary();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const tags = [...new Set(library.flatMap((e) => e.tags))].sort();
  const results = searchLibrary(library, query, { tag });
  const withVideo = library.filter((e) => e.demoVideo).length;

  return (
    <>
      <View style={styles.body}>
        <TextField label="Search the library" value={query} onChangeText={setQuery} placeholder="e.g. squat, row, carry" autoCorrect={false} />
      </View>
      <Chips label="Filter by tag" options={tags.map((t) => ({ value: t, label: t }))} value={tag} onChange={setTag} />
      <View style={[styles.actions]}>
        <View style={{ flex: 1 }}>
          <Button label="Add your own" icon="plus" kind="secondary" onPress={() => router.push('/library/new')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Match videos" icon="film" kind="secondary" onPress={() => router.push('/library/videos')} />
        </View>
      </View>
      <Text variant="caption" color="ink2" style={styles.caption}>
        {library.length} exercises · {withVideo ? `${withVideo} with your demo video` : 'no demo videos yet'}
      </Text>
      <SectionLabel>{query || tag ? `${results.length} found` : 'All exercises'}</SectionLabel>
      {results.length === 0 ? (
        <EmptyState
          message={`Nothing matches${query ? ` “${query}”` : ''}${tag ? ` in ${tag}` : ''}.`}
          actionLabel="Add it as your own"
          onAction={() => router.push(`/library/new?name=${encodeURIComponent(query)}`)}
        />
      ) : (
        results.map((e, i) => (
          <ListRow
            key={e.id}
            title={e.name}
            subtitle={[e.equipment.join(', '), e.demoVideo ? `Video: ${e.demoVideo}` : null].filter(Boolean).join(' · ')}
            right={e.isCustom ? <Tag label="Yours" /> : undefined}
            chevron
            last={i === results.length - 1}
            onPress={() => router.push(`/library/${encodeURIComponent(e.id)}`)}
          />
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  seg: { paddingHorizontal: margin, paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[4] },
  actions: { flexDirection: 'row', gap: space[3], paddingHorizontal: margin, paddingTop: space[2] },
  caption: { paddingHorizontal: margin, paddingTop: space[3] },
  card: { marginHorizontal: margin, marginTop: space[2], padding: space[3], borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.sheet, gap: space[1] },
  cardRow: { flexDirection: 'row', gap: space[2], marginTop: space[1] },
});
