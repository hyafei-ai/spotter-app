import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  PATTERN_CONFIDENCE_WORDS,
  historyWeeks,
  type ClientDay,
  type Pattern,
  type PatternConfidence,
} from '@spotter/core';
import { Button, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { playbookFor, usePlaybook } from '../playbook/store';

const SHOWN = 3;

/** Two marks for how sure: ●● clear, ●○ worth watching. Always next to the words, never alone. */
function Sure({ c }: { c: PatternConfidence }) {
  const { colors } = useTheme();
  const n = c === 'high' ? 2 : c === 'medium' ? 1 : 0;
  return (
    <View
      style={styles.sure}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { borderColor: colors.ink2, backgroundColor: i < n ? colors.ink2 : 'transparent' },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * "What works for {first}" (docs/features/patterns.md): the client's playbook first (what the coach pinned
 * or wrote), then the strongest patterns from their own history, each with confidence in words, one line of
 * what was compared, and something to try. Pin keeps it; Dismiss hides it; nothing reaches the client.
 */
export function WhatWorks({
  clientId,
  first,
  patterns,
  history,
  hidden,
}: {
  clientId: string;
  first: string;
  patterns: Pattern[];
  history: ClientDay[];
  hidden?: string;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const doc = usePlaybook((s) => s.doc);
  const { pin, dismiss, restore, addNote, remove } = usePlaybook.getState();
  const book = playbookFor(doc, clientId);
  const [all, setAll] = useState(false);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');

  const pinnedIds = new Set(book.entries.map((e) => e.patternId).filter(Boolean));
  const open = patterns.filter((p) => !pinnedIds.has(p.id) && !book.dismissed.includes(p.id));
  const shown = all ? open : open.slice(0, SHOWN);
  const weeks = historyWeeks(history);
  const byId = new Map(patterns.map((p) => [p.id, p]));

  return (
    <View style={styles.wrap}>
      <Text variant="title" accessibilityRole="header">{`What works for ${first}`}</Text>
      {hidden ? (
        <Text variant="callout" color="ink2">
          {hidden}
        </Text>
      ) : (
        <Text variant="caption" color="ink2">
          {patterns.length
            ? `From ${first}’s own ${weeks} weeks, never from averages. Leads to talk about, not rules.`
            : weeks >= 8
              ? `Nothing stands out yet in ${first}’s ${weeks} weeks. Patterns sharpen with more sleep, check-in and session history.`
              : `Patterns show after about 8 weeks of sessions with sleep or daily checks. ${first} has ${weeks === 0 ? 'none shared' : `${weeks} week${weeks === 1 ? '' : 's'}`} so far.`}
        </Text>
      )}

      {!hidden && book.entries.length ? (
        <View style={[styles.playbook, { borderLeftColor: colors.ink }]}>
          <Text variant="label" color="ink2">
            Your playbook
          </Text>
          {book.entries.map((e) => {
            const p = e.patternId ? byId.get(e.patternId) : null;
            return (
              <View key={e.id} style={styles.entry}>
                <Feather
                  name={e.source === 'coach' ? 'edit-3' : 'bookmark'}
                  size={16}
                  color={colors.ink}
                  style={{ marginTop: 3 }}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{e.text}</Text>
                  {p ? (
                    <Text variant="caption" color="ink2">
                      {`Because: ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}`}
                    </Text>
                  ) : (
                    <Text variant="caption" color="ink2">
                      Your note
                    </Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove “${e.text}” from the playbook`}
                  hitSlop={10}
                  onPress={() => remove(clientId, e.id)}
                  style={styles.iconHit}
                >
                  <Feather name="x" size={18} color={colors.ink2} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      {!hidden
        ? shown.map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.pattern,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
              ]}
            >
              <Text variant="headline">{p.title}</Text>
              <View
                style={styles.sureRow}
                accessibilityLabel={`${PATTERN_CONFIDENCE_WORDS[p.confidence]}. ${p.detail}`}
              >
                <Sure c={p.confidence} />
                <Text variant="caption" color="ink2" style={{ flex: 1 }}>
                  <Text variant="caption" style={{ fontWeight: '600', color: colors.ink }}>
                    {PATTERN_CONFIDENCE_WORDS[p.confidence]}
                  </Text>
                  {` · ${p.detail}`}
                </Text>
              </View>
              <Text variant="callout">{`Try: ${p.suggestion}`}</Text>
              <View style={styles.actions}>
                <Button
                  label="Pin to playbook"
                  icon="bookmark"
                  kind="secondary"
                  full={false}
                  onPress={() => {
                    const e = pin(clientId, p);
                    toast({
                      message: `Pinned to ${first}’s playbook.`,
                      actionLabel: 'Undo',
                      onAction: () => remove(clientId, e.id),
                    });
                  }}
                />
                <Button
                  label="Dismiss"
                  kind="quiet"
                  full={false}
                  onPress={() => {
                    dismiss(clientId, p.id);
                    toast({
                      message: 'Hidden from this list.',
                      actionLabel: 'Undo',
                      onAction: () => restore(clientId, p.id),
                    });
                  }}
                />
              </View>
            </View>
          ))
        : null}

      {!hidden && open.length > SHOWN ? (
        <View style={styles.start}>
          <Button
            label={all ? 'Show fewer' : `See ${open.length - SHOWN} more`}
            kind="quiet"
            full={false}
            onPress={() => setAll(!all)}
          />
        </View>
      ) : null}

      {!hidden ? (
        writing ? (
          <View style={{ gap: space[2] }}>
            <TextField
              label={`Your note on what works for ${first}`}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Does best with sessions before work"
              multiline
              maxLength={300}
            />
            <View style={styles.actions}>
              <Button
                label="Save note"
                kind="secondary"
                full={false}
                disabled={!note.trim()}
                disabledReason="Write the note first."
                onPress={() => {
                  addNote(clientId, note.trim());
                  setNote('');
                  setWriting(false);
                }}
              />
              <Button label="Cancel" kind="quiet" full={false} onPress={() => setWriting(false)} />
            </View>
          </View>
        ) : (
          <View style={styles.start}>
            <Button
              label="Add your own note"
              icon="edit-3"
              kind="quiet"
              full={false}
              onPress={() => setWriting(true)}
            />
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: margin, paddingTop: space[6], gap: space[2] },
  playbook: {
    borderLeftWidth: 3,
    paddingLeft: space[3],
    gap: space[2],
    marginTop: space[2],
    marginBottom: space[1],
  },
  entry: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  iconHit: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
  pattern: { paddingVertical: space[3], gap: space[1] },
  sureRow: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  sure: { flexDirection: 'row', gap: 3, paddingTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  start: { alignItems: 'flex-start', marginLeft: -space[2] },
  actions: {
    flexDirection: 'row',
    gap: space[2],
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: space[1],
  },
});
