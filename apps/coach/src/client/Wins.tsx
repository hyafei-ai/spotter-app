import { StyleSheet, View } from 'react-native';
import { HEALTH_WIN_KINDS, winMessage, type MastersWin } from '@spotter/core';
import type { DemoClient } from '@spotter/core/demo';
import { Button, Text, useTheme, margin, space } from '@spotter/ui';
import { useOpenMessage } from '../today/actions';
import { todayKey } from '../today/store';

const ago = (iso: string) => {
  const d = Math.round((Date.now() - Date.parse(`${iso}T12:00:00`)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/**
 * Wins to mention (docs/features/masters.md): honest wins beyond raw PRs, from logged data only. One tap
 * sends a prefilled message. Health-marker wins only for the coach who sees this client's health.
 */
export function Wins({
  client,
  wins,
  healthVisible,
}: {
  client: DemoClient;
  wins: MastersWin[];
  healthVisible: boolean;
}) {
  const { colors } = useTheme();
  const open = useOpenMessage();
  const first = client.name.split(' ')[0]!;
  const shown = wins.filter((w) => healthVisible || !HEALTH_WIN_KINDS.includes(w.kind));
  if (!shown.length) return null;
  return (
    <View style={styles.wrap}>
      <Text variant="title" accessibilityRole="header">
        Wins to mention
      </Text>
      <Text variant="caption" color="ink2">
        Beyond PRs: strength held, bests in a while, goals reached, steadier health markers.
      </Text>
      {shown.map((w, i) => (
        <View
          key={`${w.kind}-${i}`}
          style={[
            styles.row,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{w.coachText}</Text>
            <Text variant="caption" color="ink2">
              {ago(w.date)}
            </Text>
          </View>
          <Button
            label={`Send to ${first}`}
            kind="secondary"
            full={false}
            onPress={() =>
              open(client, winMessage(first, w), {
                done: i === 0 ? todayKey.win(client.id) : undefined,
              })
            }
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: margin, paddingTop: space[6], gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
});
