import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { margin, rowMin, space } from '../tokens';
import { ChalkStrike } from './ChalkStrike';
import { Text } from './Text';

export type SetRowState = 'upcoming' | 'active' | 'logged';

export interface SetRowProps {
  setNumber: number;
  target: string;
  /** Omitted on read-only history, where there's no comparison column. */
  previous?: string;
  state: SetRowState;
  /** What was logged, e.g. "82.5 × 8". */
  result?: string;
  /** True only for the row that was just logged, so the strike draws once. */
  justLogged?: boolean;
  onPress?: () => void;
  /** Entry steppers, shown when active. */
  children?: ReactNode;
}

/** One line of the log sheet: set · target · previous · result. Stacks at large text sizes. */
export function SetRow({ setNumber, target, previous, state, result, justLogged, onPress, children }: SetRowProps) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.35;
  const active = state === 'active';
  const logged = state === 'logged';

  const a11y = [
    `Set ${setNumber}`,
    `target ${target}`,
    previous == null ? null : previous !== '—' ? `last time ${previous}` : 'no previous result',
    logged ? `logged ${result ?? ''}` : active ? 'current set' : 'not logged',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[
        styles.wrap,
        { borderBottomColor: colors.line },
        active && { backgroundColor: colors.surface, borderLeftColor: colors.brand, borderLeftWidth: 3 },
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint={logged ? 'Opens this set to edit it' : active ? undefined : 'Makes this the current set'}
        accessibilityState={{ selected: active, checked: logged }}
        style={[styles.row, stacked && styles.rowStacked]}
      >
        <Text variant="figure" color={logged ? 'ink2' : 'ink'} style={styles.num}>
          {setNumber}
        </Text>
        <View style={[styles.cell, stacked && styles.cellStacked]}>
          {stacked ? <Text variant="label" color="ink2">Target</Text> : null}
          <Text variant="callout">{target}</Text>
        </View>
        {previous != null ? (
          <View style={[styles.cell, stacked && styles.cellStacked]}>
            {stacked ? <Text variant="label" color="ink2">Last time</Text> : null}
            <Text variant="callout" color="ink2">
              {previous}
            </Text>
          </View>
        ) : null}
        <View style={[styles.result, stacked && styles.cellStacked]}>
          {logged ? (
            <View style={styles.resultInner}>
              <Text variant="figure" tabular>
                {result}
              </Text>
              <ChalkStrike animate={!!justLogged} />
            </View>
          ) : null}
        </View>
      </Pressable>
      {active && children ? <View style={styles.entry}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  row: { minHeight: rowMin, paddingHorizontal: margin - 3, paddingVertical: space[2], flexDirection: 'row', alignItems: 'center', gap: space[3] },
  rowStacked: { flexWrap: 'wrap', alignItems: 'flex-start' },
  num: { width: 24 },
  cell: { flex: 1 },
  cellStacked: { flexBasis: '80%', flexGrow: 1 },
  result: { flex: 1.1, alignItems: 'flex-end' },
  resultInner: { position: 'relative', paddingHorizontal: 2 },
  entry: { paddingHorizontal: margin - 3, paddingBottom: space[4], gap: space[3] },
});
