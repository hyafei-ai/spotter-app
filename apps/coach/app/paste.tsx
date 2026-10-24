import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { blocksFromText, parseScalingLevels } from '@spotter/core';
import { IconButton, Screen, SectionLabel, SegmentedControl, Text, TextField, useTheme, margin, space } from '@spotter/ui';
import { tenant } from '../src/env';
import { Chips } from '../src/programUi';
import { BlocksPreview } from '../src/multisport/ui';
import { DestinationFooter, strengthNames } from '../src/multisport/destination';

const EXAMPLE = 'Fran\nFor time\n21-15-9\nThrusters (43/30 kg)\nPull-ups';

/**
 * Paste a workout (docs/ux/multisport.md 5.4): whiteboard text → the session the app can run. The preview reads as
 * you type; the parser's warnings sit above it in plain words, and each one is fixed by editing the text or with
 * the one control it needs (load unit, scaling level). No AI: what the rules can't read is said, not guessed.
 */
export default function Paste() {
  const { program, day } = useLocalSearchParams<{ program?: string; day?: string }>();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lb'>(tenant.units);
  const [level, setLevel] = useState<string | null>(null);
  const levels = useMemo(() => parseScalingLevels(text)?.levels.map((l) => l.name) ?? [], [text]);
  const read = useMemo(() => blocksFromText(text, { defaultLoadUnit: unit, level: level ?? undefined }), [text, unit, level]);
  const empty = !text.trim();
  const unitWarning = read.warnings.some((w) => w.includes('Loads with no unit'));
  const warnings = read.warnings.filter((w) => !w.startsWith('Read the ') || levels.length < 2).filter((w) => w !== 'Nothing to read');
  // Default name: the parts' names ("Strength + Metcon"), else the one title ("Fran"), else "Session".
  const titles = read.blocks.map((b) => b.title).filter((t): t is string => !!t);
  const suggested = titles.length > 1 ? titles.slice(0, 3).join(' + ') : titles[0];
  const [name, setName] = useState<string | null>(null);
  const title = name ?? suggested ?? (read.blocks.length ? 'Session' : '');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/programs'));

  return (
    <Screen
      footer={
        <DestinationFooter
          programKey={program}
          dayId={day}
          title={title || 'Session'}
          input={read}
          disabledReason={empty ? 'Paste a workout first' : read.blocks.length === 0 ? 'Nothing readable yet: see the notes above the preview' : undefined}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Paste a workout
        </Text>
        <Text variant="callout" color="ink2">
          From your whiteboard, notes or a message. It’s read as you type.
        </Text>
        <TextField
          label="Workout"
          value={text}
          onChangeText={setText}
          placeholder={EXAMPLE}
          multiline
          autoCorrect={false}
          style={{ minHeight: 190, textAlignVertical: 'top' }}
          accessibilityHint="The preview below updates as you type"
        />
      </View>

      {!empty ? (
        <>
          {levels.length > 1 ? (
            <>
              <SectionLabel>Level to use</SectionLabel>
              <Chips label="Scaling level" options={levels.map((l) => ({ value: l, label: l }))} value={level ?? levels[0]!} onChange={(l) => setLevel(l)} />
            </>
          ) : null}
          {unitWarning || unit !== tenant.units ? (
            <View style={styles.body}>
              <Text variant="label" color="ink2">
                Loads with no unit are in
              </Text>
              <SegmentedControl
                label="Loads with no unit are in"
                value={unit}
                onChange={setUnit}
                options={[
                  { value: 'kg', label: 'kg' },
                  { value: 'lb', label: 'lb' },
                ]}
              />
            </View>
          ) : null}

          <View style={styles.body}>
            <Text variant="bodyStrong" accessibilityLiveRegion="polite">
              {read.readAs.length ? `Read as: ${read.readAs.join(' · ')}` : 'Nothing read yet'}
            </Text>
          </View>
          {warnings.length ? (
            <View accessibilityRole="alert" style={[styles.warn, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]}>
              <Text variant="label" color="ink2">
                {`Check ${warnings.length === 1 ? 'this' : `these ${warnings.length}`}`}
              </Text>
              {warnings.map((w) => (
                <Text key={w} variant="callout">
                  {w}
                </Text>
              ))}
            </View>
          ) : null}

          {read.blocks.length ? (
            <>
              <SectionLabel>Preview</SectionLabel>
              <BlocksPreview blocks={read.blocks} strengthNames={strengthNames(read)} />
              {!day ? (
                <View style={styles.body}>
                  <TextField label="Session name" value={title} onChangeText={setName} placeholder="e.g. Tuesday WOD" />
                </View>
              ) : null}
              <Text variant="caption" color="ink2" style={styles.body}>
                You can change any part after adding it.
              </Text>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[2] },
  warn: { marginHorizontal: margin, marginTop: space[3], padding: space[3], borderLeftWidth: 3, borderRadius: 6, gap: 4 },
});
