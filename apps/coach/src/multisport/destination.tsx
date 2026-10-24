import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { addBlocksToDay, describeExercise, findDay, strengthExercise, updateDay, type Block, type StrengthLine } from '@spotter/core';
import { Button, useToast, space } from '@spotter/ui';
import { useCoach } from '../store';
import { useEditing, usePrograms } from '../programs';
import { shortDate } from '../format';
import { tenant } from '../env';
import { SendSheet } from './ui';

/** Strength lines as the preview shows them: "Back Squat 5 × 5 · 80% 1RM". */
export function strengthNames(input: { blocks: Block[]; strength: StrengthLine[] }): string[][] {
  return input.blocks
    .filter((b) => b.kind === 'strength')
    .map((b) =>
      (b.kind === 'strength' ? b.exerciseIds : []).map((ref) => {
        const line = input.strength[Number(ref.slice(5))];
        if (!line) return ref;
        const ex = strengthExercise(line, { id: line.movementId ?? 'x', name: line.name, metric: 'weight_reps' }, () => 'preview');
        return `${line.name} ${describeExercise(ex, tenant.units)}`;
      }),
    );
}

/**
 * Where pasted or template blocks go (docs/ux/multisport.md 5.4–5.6): into the day the coach came from, or (from
 * Programs) to a client on a date, or saved as a new draft program. One primary action, the others quiet.
 */
export function DestinationFooter({
  programKey,
  dayId,
  title,
  input,
  disabledReason,
}: {
  programKey?: string;
  dayId?: string;
  title: string;
  input: { blocks: Block[]; strength: StrengthLine[] };
  disabledReason?: string;
}) {
  const toast = useToast();
  const { program } = useEditing(programKey ?? '');
  const { change, sendSession, programFromBlocks, exerciseFor } = usePrograms();
  const clients = useCoach((s) => s.clients);
  const [sending, setSending] = useState(false);
  const found = program && dayId ? findDay(program, dayId) : null;
  const parts = input.blocks.length;

  if (found && programKey) {
    return (
      <Button
        label={`Add to ${found.day.title || 'this session'}`}
        disabled={!!disabledReason}
        disabledReason={disabledReason}
        onPress={() => {
          change(programKey, updateDay(program!, found.day.id, (d) => addBlocksToDay(d, input, exerciseFor)));
          toast({ message: `Added ${parts} part${parts === 1 ? '' : 's'} to ${found.day.title || 'the session'}.` });
          router.back();
        }}
      />
    );
  }

  return (
    <View style={styles.footer}>
      <Button label="Send to a client" icon="send" disabled={!!disabledReason} disabledReason={disabledReason} onPress={() => setSending(true)} />
      <Button
        label="Save as a new program"
        kind="quiet"
        disabled={!!disabledReason}
        onPress={() => {
          const pid = programFromBlocks(title, input);
          toast({ message: 'Saved as a draft program.' });
          router.replace(`/program/${pid}`);
        }}
      />
      <SendSheet
        visible={sending}
        title={`Send “${title}”`}
        onClose={() => setSending(false)}
        onSend={(clientId, date) => {
          const res = sendSession([clientId], date, { title, ...input });
          const name = clients.find((c) => c.id === clientId)?.name.split(' ')[0] ?? 'Your client';
          if (res.sent.length) toast({ message: `Sent to ${name} for ${shortDate(date)}. They see it on that day.` });
          else toast({ message: `${name}’s program is paused: resume it first.` });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ footer: { gap: space[1] } });
