import { StyleSheet, Switch, View } from 'react-native';
import { ListRow, Text, useTheme, margin, space } from '@spotter/ui';
import { AI_LIVE, DEMO_MONTHLY_CAP, useAi } from './store';

/** Coach Me → AI drafts usage, plus a demo control to show the "generation failed" state. */
export function AiMeRow() {
  const { colors } = useTheme();
  const used = useAi((s) => s.used);
  const simulateFailure = useAi((s) => s.simulateFailure);
  const setSimulateFailure = useAi((s) => s.setSimulateFailure);
  return (
    <>
      <ListRow
        title="AI drafts"
        subtitle={
          AI_LIVE
            ? 'Summaries and program drafts. Every draft waits for your approval.'
            : `${used} of ${DEMO_MONTHLY_CAP} used this month. Every draft waits for your approval.`
        }
      />
      {!AI_LIVE ? (
        <View style={[styles.toggle, { borderBottomColor: colors.line }]}>
          <Text style={{ flex: 1 }}>Demo: make AI drafts fail</Text>
          <Switch
            value={simulateFailure}
            onValueChange={setSimulateFailure}
            accessibilityLabel="Demo: make AI drafts fail"
            trackColor={{ true: colors.brand, false: colors.line }}
            thumbColor={colors.surface}
            {...{ activeThumbColor: colors.surface }}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginHorizontal: margin, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
});
