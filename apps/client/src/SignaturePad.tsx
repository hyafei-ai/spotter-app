import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, useTheme, radius, space } from '@spotter/ui';

/** Drawn signature (C-2 waiver). Produces an SVG document stored with the signed record. */
export function SignaturePad({ onChange }: { onChange: (svg: string | null) => void }) {
  const { colors } = useTheme();
  const [strokes, setStrokes] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const currentRef = useRef('');
  const size = useRef({ w: 300, h: 160 });

  const emit = (all: string[]) => {
    const { w, h } = size.current;
    onChange(
      all.length
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}">${all
            .map((d) => `<path d="${d}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`)
            .join('')}</svg>`
        : null,
    );
  };

  // Plain responder props (rather than PanResponder) so the handlers can read current state directly.
  const responder: Partial<ViewProps> = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      currentRef.current = `M${x.toFixed(1)} ${y.toFixed(1)}`;
      setCurrent(currentRef.current);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      currentRef.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      setCurrent(currentRef.current);
    },
    onResponderRelease: () => {
      const d = currentRef.current;
      currentRef.current = '';
      setCurrent('');
      if (!d.includes('L')) return;
      const next = [...strokes, d];
      setStrokes(next);
      emit(next);
    },
  };

  const clear = () => {
    setStrokes([]);
    emit([]);
  };

  return (
    <View style={{ gap: space[2] }}>
      <View style={styles.labelRow}>
        <Text variant="label" color="ink2" style={{ flex: 1 }}>
          Sign here
        </Text>
        {strokes.length ? (
          <Pressable onPress={clear} accessibilityRole="button" hitSlop={10}>
            <Text variant="bodyStrong" style={{ color: colors.brand }}>
              Clear
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View
        {...responder}
        onLayout={(e: LayoutChangeEvent) => {
          size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        accessible
        accessibilityLabel={strokes.length ? 'Signature drawn' : 'Signature area. Draw your signature with one finger.'}
        style={[styles.pad, { borderColor: colors.line, backgroundColor: colors.surface }]}
      >
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {[...strokes, current].filter(Boolean).map((d, i) => (
            <Path key={i} d={d} stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
        </Svg>
        <View pointerEvents="none" style={[styles.baseline, { borderBottomColor: colors.line }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  pad: { height: 160, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control, overflow: 'hidden' },
  baseline: { position: 'absolute', left: 16, right: 16, bottom: 36, borderBottomWidth: 1 },
});
