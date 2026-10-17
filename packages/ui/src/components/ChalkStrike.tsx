import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { motion } from '../tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// A slightly uneven stroke, like chalk dragged across a whiteboard row.
const STROKE = 'M2 12.5 C 14 10.8, 26 12.2, 38 10.9 S 62 9.4, 74 10.2 S 92 8.6, 98 8.9';
const LENGTH = 100;

/**
 * The signature detail: drawn across a set row when the set is logged. Used nowhere else.
 * `animate` is false for rows that were already logged when the screen opened.
 */
export function ChalkStrike({ animate }: { animate: boolean }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(animate && !reduceMotion ? 0 : 1);

  useEffect(() => {
    if (animate && !reduceMotion) {
      progress.value = withTiming(1, { duration: motion.strike, easing: Easing.out(Easing.cubic) });
    }
  }, [animate, reduceMotion, progress]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: LENGTH * (1 - progress.value) }));

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AnimatedPath
        d={STROKE}
        stroke={colors.strike}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={[LENGTH, LENGTH]}
        animatedProps={animatedProps}
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
    </Svg>
  );
}

/** Finish screen: the session's strikes closed into tally groups of five. */
export function Tally({ count }: { count: number }) {
  const { colors } = useTheme();
  const groups = Math.ceil(count / 5);
  const width = groups * 34;
  const strokes: string[] = [];
  for (let g = 0; g < groups; g++) {
    const n = Math.min(5, count - g * 5);
    const x0 = g * 34 + 3;
    for (let i = 0; i < Math.min(n, 4); i++) {
      const x = x0 + i * 6;
      strokes.push(`M${x} 4 C ${x + 0.6} 12, ${x - 0.4} 20, ${x + 0.3} 28`);
    }
    if (n === 5) strokes.push(`M${x0 - 3} 24 C ${x0 + 6} 18, ${x0 + 14} 12, ${x0 + 24} 7`);
  }
  return (
    <Svg width={width} height={32} viewBox={`0 0 ${width} 32`} accessibilityLabel={`${count} sets logged`}>
      {strokes.map((d, i) => (
        <Path key={i} d={d} stroke={colors.strike} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}
