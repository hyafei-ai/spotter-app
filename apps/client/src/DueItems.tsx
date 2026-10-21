import { View } from 'react-native';
import { SectionLabel } from '@spotter/ui';
import { CheckInDueRow, FormCheckReplyRow, FormCheckRequestRow } from './formchecks/DueRows';

/**
 * Today's "Due" list (C-3): weekly check-in, form check requested, habit tasks, nutrition.
 * Each feature adds its own row component to DUE_ROWS. A row renders null when nothing is due.
 */
const DUE_ROWS: React.ComponentType[] = [
  // feature rows: add one line per feature, e.g. CheckInDueRow,
  CheckInDueRow,
  FormCheckRequestRow,
  FormCheckReplyRow,
];

export function DueItems() {
  if (DUE_ROWS.length === 0) return null;
  return (
    <View>
      <SectionLabel>Due</SectionLabel>
      {DUE_ROWS.map((Row, i) => (
        <Row key={i} />
      ))}
    </View>
  );
}
