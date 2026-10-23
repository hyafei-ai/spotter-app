import { StyleSheet, View } from 'react-native';
import { FUEL_LEVEL_LABEL, type FuelLevel } from '@spotter/core';
import { SectionLabel, Skeleton, Tag, Text, margin, space } from '@spotter/ui';
import { useCoach } from '../store';
import { useFuelShare, useFuelTriage } from './store';

const LEVEL_TAG: Record<FuelLevel, 'success' | 'warning' | 'brand'> = { none: 'success', watch: 'warning', talk_to_someone: 'brand' };
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

/** What to say, by level. Uses the client's name, never pronouns. */
function whatToSay(level: FuelLevel, name: string): string {
  switch (level) {
    case 'talk_to_someone':
      return `Worth a private, low-key conversation. The app has already suggested ${name} see a doctor or sports dietitian; ask if ${name} would like help finding one. Keep it about energy for training, not food rules or body size.`;
    case 'watch':
      return `Ask how eating has been around training days, for example “How’s food been fitting around sessions lately?”. Listen first; the app has already shown ${name} some simple fixes.`;
    case 'none':
      return 'Nothing to raise. Fuelling looks like it’s keeping up with training.';
  }
}

/**
 * K-3 client detail → Fuelling: the level and signs the client chose to share, and what to say.
 * Never food logs or energy figures (the Nutrition section already covers what the coach sees there).
 */
export function FuelSection({ clientId }: { clientId: string }) {
  const client = useCoach((s) => s.clients.find((c) => c.id === clientId));
  const { loaded, share } = useFuelShare(clientId);
  useFuelTriage();
  const name = client?.name.split(' ')[0] ?? 'This client';

  return (
    <>
      <SectionLabel>Fuelling</SectionLabel>
      <View style={styles.body}>
        {!loaded ? (
          <Skeleton height={48} />
        ) : share ? (
          <View style={{ gap: space[2] }} accessibilityLabel={`Fuel check: ${FUEL_LEVEL_LABEL[share.level]}. ${share.signs.join('. ')}`}>
            <Tag label={FUEL_LEVEL_LABEL[share.level]} tone={LEVEL_TAG[share.level]} />
            {share.signs.map((s) => (
              <Text key={s} variant="callout">
                {'· '}
                {s}
              </Text>
            ))}
            <Text variant="callout" color="ink2">
              {whatToSay(share.level, name)}
            </Text>
            <Text variant="caption" color="ink2">
              Shared by {name} · {day(share.date)} · A screen, not a diagnosis.
            </Text>
          </View>
        ) : (
          <Text variant="callout" color="ink2">
            {name} keeps the fuel check private.
          </Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingVertical: space[2] },
});
