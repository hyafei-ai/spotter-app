import { StyleSheet, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { Button, Skeleton, Text, useTheme, margin, space } from '@spotter/ui';
import { useClientMemory } from './useClientMemory';

/**
 * The 30-second prep card (docs/jtbd.md, coach job: "prep for a real conversation in under 30
 * seconds"). Three to five plain sentences built from memory, never more. No scores.
 */
export function PrepCard({ clientId, inset = true }: { clientId: string; inset?: boolean }) {
  const { colors } = useTheme();
  const net = useNetInfo();
  const { client, prep, status, retry } = useClientMemory(clientId);
  const first = client?.name.split(' ')[0] ?? 'them';

  return (
    <View
      accessible
      accessibilityLabel={
        status === 'ready' ? `Before you talk to ${first}. ${prep.join(' ')}` : undefined
      }
      style={[
        styles.card,
        inset && styles.inset,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      <Text variant="label" color="ink2">
        Before you talk to {first}
      </Text>
      {status === 'loading' ? (
        <View style={{ gap: space[2], paddingTop: space[1] }}>
          <Skeleton width="80%" />
          <Skeleton width="65%" />
          <Skeleton width="72%" />
        </View>
      ) : status === 'error' ? (
        <View style={{ gap: space[2] }}>
          <Text variant="callout">
            Couldn’t load your notes and follow-ups. Check your connection and try again.
          </Text>
          <Button label="Try again" kind="quiet" icon="refresh-cw" full={false} onPress={retry} />
        </View>
      ) : (
        prep.map((line, i) => (
          <Text key={i} variant="callout" style={i === 0 ? styles.first : undefined}>
            {line}
          </Text>
        ))
      )}
      {net.isConnected === false && status !== 'error' ? (
        <Text variant="caption" color="ink2">
          You’re offline. This is what’s saved on this phone.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space[4],
    gap: space[1],
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  inset: { marginHorizontal: margin, marginTop: space[4] },
  first: { paddingTop: space[1] },
});
