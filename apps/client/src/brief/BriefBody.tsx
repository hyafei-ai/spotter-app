import { View } from 'react-native';
import type { DailyBrief, SharedBrief } from '@spotter/core';
import { Text, space } from '@spotter/ui';

/**
 * The daily brief's body: how today feels, "Here's why" (the data behind it, strongest first) and
 * "Here's what to do". Words carry the meaning; nothing is colour-only.
 */
export function BriefBody({ brief }: { brief: DailyBrief | SharedBrief }) {
  const calibration = 'calibration' in brief ? brief.calibration : null;
  return (
    <View style={{ gap: space[2] }} accessible accessibilityLabel={`${brief.feel}. ${brief.why.map((r) => r.text).join('. ')}. ${brief.todo.join('. ')}`}>
      <Text variant="headline" accessibilityRole="header">
        {brief.feel}
      </Text>
      {brief.why.length ? (
        <View style={{ gap: 2 }}>
          <Text variant="label" color="ink2">
            Here’s why
          </Text>
          {brief.why.map((r, i) => (
            <Text key={`${r.source}-${i}`} variant="callout">
              {'· '}
              {r.text}
            </Text>
          ))}
        </View>
      ) : null}
      {brief.todo.length ? (
        <View style={{ gap: 2 }}>
          <Text variant="label" color="ink2">
            Here’s what to do
          </Text>
          {brief.todo.map((t, i) => (
            <Text key={i} variant="callout">
              {`${i + 1}. ${t}`}
            </Text>
          ))}
        </View>
      ) : null}
      {calibration ? (
        <Text variant="caption" color="ink2">
          {calibration.reason}
        </Text>
      ) : null}
    </View>
  );
}
