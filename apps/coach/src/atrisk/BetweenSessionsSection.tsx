import { StyleSheet, View } from 'react-native';
import { SectionLabel, Skeleton, Text, margin, space } from '@spotter/ui';
import { useCoach } from '../store';
import { useBetweenSessions } from './inputs';
import { summaryLines, whatToAsk } from './summary';

/**
 * K-3 client detail → what the athlete shared between sessions (reads, fuel check, pain, progress,
 * cycle phase), with what to ask. Only what they chose to share; nothing else is shown or implied.
 */
export function BetweenSessionsSection({ clientId }: { clientId: string }) {
  const client = useCoach((s) => s.clients.find((c) => c.id === clientId));
  const { ready, data } = useBetweenSessions(clientId);
  const first = client?.name.split(' ')[0] ?? 'This client';
  const lines = summaryLines(data);
  const asks = whatToAsk(data, first);

  return (
    <>
      <SectionLabel>Between sessions</SectionLabel>
      <View style={styles.body}>
        {!ready ? (
          <Skeleton height={48} />
        ) : lines.length === 0 ? (
          <Text variant="callout" color="ink2">
            {first} hasn’t shared anything beyond sessions yet. They choose what to share: daily reads, fuel check, pain, progress, cycle.
          </Text>
        ) : (
          <View style={{ gap: space[1] }}>
            {lines.map((l) => (
              <Text key={l.key} variant="callout" style={l.flag ? { fontWeight: '600' } : undefined}>
                {'· '}
                {l.text}
              </Text>
            ))}
            {asks.length ? (
              <View style={{ gap: space[1], marginTop: space[2] }}>
                <Text variant="label" color="ink2">
                  What to ask
                </Text>
                {asks.map((a) => (
                  <Text key={a} variant="callout">
                    {'“'}
                    {a}
                    {'”'}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text variant="caption" color="ink2" style={{ marginTop: space[1] }}>
              Only what {first} chose to share with you.
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingVertical: space[2] },
});
