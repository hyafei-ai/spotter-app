import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  BLOCK_GROUPS,
  BLOCK_KIND_EXAMPLE,
  BLOCK_KIND_LABEL,
  CHECK_STANDARD,
  SCORING_LABEL,
  addDays,
  blockKindLine,
  blockLabel,
  blockLines,
  blockNeedsVerify,
  dayContentNames,
  dayFor,
  movementInLibrary,
  type Block,
  type BlockKind,
  type BlockMovement,
} from '@spotter/core';
import { isoDay } from '@spotter/core/demo';
import { Button, ListRow, SectionLabel, Sheet, Tag, Text, useTheme, margin, space } from '@spotter/ui';
import { tenant } from '../env';
import { shortDate } from '../format';
import { useCoach } from '../store';
import { activeAssignmentFor, usePrograms } from '../programs';
import { useStyleProfile } from './styles';

/* ---------- a block as one row (day editor, previews) ---------- */

/**
 * One non-strength block: the kind line in small caps ("AMRAP · 20 min"), the name, and up to four movement lines.
 * Hairlines, no card (art direction: the log sheet, not tiles).
 */
export function BlockSummary({ block, onPress, right, lines = 4, divider = true }: { block: Block; onPress?: () => void; right?: React.ReactNode; lines?: number; divider?: boolean }) {
  const { colors } = useTheme();
  const all = blockLines(block, tenant.units);
  const shown = all.slice(0, lines);
  const body = (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="label" color="ink2">
        {blockKindLine(block)}
      </Text>
      <Text variant="bodyStrong">{blockLabel(block)}</Text>
      {shown.map((l, i) => (
        <Text key={i} variant="callout" color="ink2" numberOfLines={1}>
          {l}
        </Text>
      ))}
      {all.length > shown.length ? (
        <Text variant="caption" color="ink2">{`and ${all.length - shown.length} more`}</Text>
      ) : null}
      <View style={styles.tags}>
        <Tag label={`Scored by ${SCORING_LABEL[block.scoring].toLowerCase()}`} />
        {blockNeedsVerify(block) ? <Tag label="Check the standard" tone="warning" /> : null}
      </View>
    </View>
  );
  if (!onPress)
    return (
      <View style={[styles.row, { borderBottomColor: colors.line }, !divider && styles.flush]}>
        {body}
        {right}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${blockLabel(block)}. ${blockKindLine(block)}. Edit`}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.line, backgroundColor: pressed ? colors.surface : 'transparent' }, !divider && styles.flush]}
    >
      {body}
      {right ?? <Feather name="chevron-right" size={20} color={colors.ink2} />}
    </Pressable>
  );
}

/** Read-only preview of blocks (paste, templates): movements not in the library are tagged, verify notes shown. */
export function BlocksPreview({ blocks, strengthNames, verifyNote = true }: { blocks: Block[]; strengthNames: string[][]; verifyNote?: boolean }) {
  const { colors } = useTheme();
  let s = 0;
  return (
    <View>
      {blocks.map((b) => {
        if (b.kind === 'strength') {
          const names = strengthNames[s++] ?? [];
          return (
            <View key={b.id} style={[styles.row, { borderBottomColor: colors.line }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" color="ink2">
                  {b.title && b.title.toLowerCase() !== 'strength' ? `Strength · ${b.title}` : 'Strength'}
                </Text>
                {names.map((n, i) => (
                  <Text key={i} variant="callout">
                    {n}
                  </Text>
                ))}
              </View>
            </View>
          );
        }
        const ms: BlockMovement[] = b.kind === 'station_race' ? b.segments : 'movements' in b ? b.movements : [];
        const unknown = ms.filter((m) => !movementInLibrary(m));
        return (
          <View key={b.id}>
            <BlockSummary block={b} lines={8} />
            {unknown.length ? (
              <Text variant="caption" color="ink2" style={styles.note}>
                {`Not in your library, logged by name: ${unknown.map((m) => m.name).join(', ')}`}
              </Text>
            ) : null}
            {verifyNote && blockNeedsVerify(b) ? (
              <Text variant="caption" style={[styles.note, { color: colors.warning }]}>
                {`${CHECK_STANDARD}: race loads and distances.`}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ---------- the block picker ---------- */

export type PickerChoice = { type: 'kind'; kind: BlockKind } | { type: 'paste' } | { type: 'templates' };

/** "Add to this session": paste and templates first, then kinds grouped by style (the coach's styles first). */
export function BlockPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (c: PickerChoice) => void }) {
  const { colors } = useTheme();
  const profile = useStyleProfile();
  const groups = profile.groupOrder.map((id) => BLOCK_GROUPS.find((g) => g.id === id)!).filter(Boolean);
  return (
    <Sheet visible={visible} title="Add to this session" onClose={onClose}>
      <ScrollView style={{ maxHeight: 560 }}>
        <ListRow title="Paste a workout" subtitle="Whiteboard text becomes a session you can check" left={<Feather name="clipboard" size={20} color={colors.ink} />} chevron onPress={() => onPick({ type: 'paste' })} />
        <ListRow title="Templates" subtitle="Benchmarks, race simulations, runs" left={<Feather name="book-open" size={20} color={colors.ink} />} chevron last onPress={() => onPick({ type: 'templates' })} />
        {groups.map((g) => (
          <View key={g.id}>
            <SectionLabel>{g.label}</SectionLabel>
            {g.kinds.map((k, i) => (
              <ListRow key={k} title={k === 'strength' ? 'Exercises with sets' : BLOCK_KIND_LABEL[k]} subtitle={BLOCK_KIND_EXAMPLE[k]} last={i === g.kinds.length - 1} onPress={() => onPick({ type: 'kind', kind: k })} />
            ))}
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

/* ---------- send one session to a client ---------- */

/** Today, tomorrow and the five days after, as chips. */
function dateOptions(): { iso: string; label: string }[] {
  const today = isoDay(0);
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(today, i);
    return { iso, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : shortDate(iso).split(',')[0]!.split(' ')[0]! };
  });
}

/**
 * Pick a date, then tap a client: their session on that date becomes this one ("Edit today's session" for that
 * date). Clients without a program can't take a single session yet; the row says so.
 */
export function SendSheet({ visible, title, onClose, onSend }: { visible: boolean; title: string; onClose: () => void; onSend: (clientId: string, date: string) => void }) {
  const { colors } = useTheme();
  const clients = useCoach((s) => s.clients);
  const { assignments } = usePrograms();
  const options = dateOptions();
  const [date, setDate] = useState(options[1]!.iso);
  const [sent, setSent] = useState<string[]>([]);
  const rows = clients
    .filter((c) => c.status !== 'paused')
    .map((c) => {
      const a = activeAssignmentFor(assignments, c.id);
      const d = a ? dayFor(a, date) : null;
      const paused = !a && assignments.some((x) => x.clientId === c.id && x.status === 'paused');
      const what = paused
        ? 'Program paused'
        : !a || !d
          ? 'No program: sends this one session'
          : d.kind === 'session'
            ? `Replaces ${dayContentNames(d.day).length ? d.day.title : 'the session'}${d.overridden ? ' (already edited)' : ''}`
            : d.kind === 'rest'
              ? 'Adds it on a rest day'
              : 'Program not running that day';
      return { c, ok: !paused && (!a || (!!d && (d.kind === 'session' || d.kind === 'rest'))), what };
    })
    .sort((x, y) => Number(y.ok) - Number(x.ok));
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Which day">
        {options.map((o) => {
          const on = o.iso === date;
          return (
            <Pressable
              key={o.iso}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${o.label}, ${shortDate(o.iso)}`}
              onPress={() => setDate(o.iso)}
              style={[styles.chip, { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : 'transparent' }]}
            >
              <Text variant="callout" style={{ color: on ? colors.paper : colors.ink }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView style={{ maxHeight: 420 }}>
        {rows.map(({ c, ok, what }, i) => {
          const done = sent.includes(`${c.id}:${date}`);
          return (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={done ? `Sent for ${shortDate(date)}` : what}
              right={done ? <Feather name="check" size={20} color={colors.brand} /> : ok ? <Text variant="bodyStrong" style={{ color: colors.brand }}>Send</Text> : undefined}
              accessibilityLabel={ok ? `Send to ${c.name} for ${shortDate(date)}. ${what}` : `${c.name}. ${what}`}
              last={i === rows.length - 1}
              onPress={
                ok && !done
                  ? () => {
                      onSend(c.id, date);
                      setSent((s) => [...s, `${c.id}:${date}`]);
                    }
                  : undefined
              }
            />
          );
        })}
      </ScrollView>
      <View style={{ paddingHorizontal: margin, paddingTop: space[2] }}>
        <Button label="Done" kind={sent.length ? 'primary' : 'quiet'} onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  flush: { borderBottomWidth: 0, paddingBottom: 0 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1], marginTop: space[1] },
  note: { paddingHorizontal: margin, paddingTop: space[1] },
  chips: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[2] },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space[4], minHeight: 40, justifyContent: 'center' },
});
