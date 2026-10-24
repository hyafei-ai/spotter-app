import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { blockKindLine, blockLabel, blockLines, needsResult, scoreText, type Block, type BlockResult } from '@spotter/core';
import { StrikeUnder, Text, useTheme, margin, space } from '@spotter/ui';
import { tenant } from '../env';

/**
 * A non-strength part of the session on the log sheet: kind line, name, the whiteboard lines and, once logged, the
 * score struck through with the chalk strike (the same "done" mark as a set). Hairlines, no card.
 */
export function BlockSection({
  block,
  result,
  isNext,
  first,
  onScore,
}: {
  block: Block;
  result: BlockResult | null;
  isNext: boolean;
  first: string;
  onScore: () => void;
}) {
  const { colors } = useTheme();
  const lines = blockLines(block, tenant.units);
  const scorable = needsResult(block);
  return (
    <View style={[styles.wrap, { borderBottomColor: colors.line }]} accessibilityLabel={`${blockLabel(block)}. ${blockKindLine(block)}. ${result ? `Done: ${scoreText(result, tenant.units)}` : isNext ? 'Next' : 'Not done yet'}`}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" style={{ color: isNext && !result ? colors.brand : colors.ink2 }}>
            {isNext && !result ? `Next · ${blockKindLine(block)}` : blockKindLine(block)}
          </Text>
          <Text variant="headline">{blockLabel(block)}</Text>
        </View>
        {result ? <Feather name="check" size={20} color={colors.brand} accessibilityElementsHidden /> : null}
      </View>
      <View style={styles.lines}>
        {lines.map((l, i) => (
          <Text key={i} variant="callout">
            {l}
          </Text>
        ))}
        {block.note ? (
          <View style={[styles.note, { borderLeftColor: colors.brand }]}>
            <Text variant="caption" color="ink2">{`From ${first}`}</Text>
            <Text variant="callout">{block.note}</Text>
          </View>
        ) : null}
      </View>
      {result ? (
        <Pressable onPress={onScore} accessibilityRole="button" accessibilityLabel={`Your score ${scoreText(result, tenant.units)}. Change it`} style={styles.result} hitSlop={6}>
          <View>
            <Text variant="figure" tabular>
              {scoreText(result, tenant.units)}
            </Text>
            <StrikeUnder width={120} />
          </View>
          <Text variant="bodyStrong" style={{ color: colors.brand }}>
            Change
          </Text>
        </Pressable>
      ) : scorable && !isNext ? (
        <Pressable onPress={onScore} accessibilityRole="button" style={styles.enter} hitSlop={6}>
          <Text variant="bodyStrong" style={{ color: colors.brand }}>
            Done it already? Enter your score
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: space[5], paddingBottom: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: margin, gap: space[2] },
  lines: { paddingHorizontal: margin, paddingTop: space[2], gap: 2 },
  note: { borderLeftWidth: 3, paddingLeft: space[3], marginTop: space[2], gap: 2 },
  result: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: margin, paddingTop: space[3], minHeight: 44 },
  enter: { paddingHorizontal: margin, paddingTop: space[2], minHeight: 44, justifyContent: 'center' },
});
