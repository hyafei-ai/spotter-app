import { useEffect, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { fonts, margin, radius, space, touchMin } from '../tokens';
import { haptic } from '../haptics';
import { Text } from './Text';
import { Button } from './Button';

/* ---------- ScreenHeader ---------- */

export function ScreenHeader({
  title,
  subtitle,
  left,
  right,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {left ? <View style={styles.headerSide}>{left}</View> : null}
      <View style={{ flex: 1 }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" color="ink2">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.headerSide}>{right}</View> : null}
    </View>
  );
}

export function IconButton({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={styles.iconBtn}>
      <Feather name={icon} size={22} color={colors.ink} />
    </Pressable>
  );
}

/* ---------- Section label ---------- */

export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { borderBottomColor: colors.line }]}>
      <Text variant="label" color="ink2" accessibilityRole="header" style={{ flex: 1 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

/* ---------- Tag ---------- */

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'brand' | 'warning' | 'error' | 'success' }) {
  const { colors } = useTheme();
  const fg = tone === 'neutral' ? colors.ink2 : colors[tone];
  return (
    <View style={[styles.tag, { borderColor: fg }]}>
      <Text variant="label" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}

/* ---------- Monogram ---------- */

export function Monogram({ initials, size = 48, imageUrl, label }: { initials: string; size?: number; imageUrl?: string; label?: string }) {
  const { colors } = useTheme();
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel={label} />;
  }
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : undefined}
      // Without a label the monogram is decorative: the row around it already names the person.
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!label}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text
        style={{ fontFamily: fonts.title, fontSize: size * 0.42, lineHeight: size * 0.5, color: colors.brandInk }}
        allowFontScaling={false}
      >
        {initials}
      </Text>
    </View>
  );
}

/* ---------- EmptyState: one sentence + one action ---------- */

export function EmptyState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text variant="body" color="ink2">
        {message}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} kind="secondary" onPress={onAction} full={false} /> : null}
    </View>
  );
}

/* ---------- Skeleton ---------- */

export function Skeleton({ width = '100%', height = 16, style }: { width?: ViewStyle['width']; height?: number; style?: ViewStyle }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const o = useSharedValue(0.6);
  useEffect(() => {
    if (!reduceMotion) o.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [o, reduceMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: 4, backgroundColor: colors.line }, anim, style]}
    />
  );
}

/* ---------- TextField ---------- */

export function TextField({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="label" color="ink2">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.ink2}
        {...input}
        style={[
          styles.input,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.line },
          input.multiline && { minHeight: 96, textAlignVertical: 'top' },
        ]}
      />
      {error ? (
        <View style={styles.fieldMsg}>
          <Feather name="alert-circle" size={14} color={colors.error} />
          <Text variant="caption" color="error">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" color="ink2">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- SegmentedControl ---------- */

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.seg, { borderColor: colors.line }]}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
            accessibilityLabel={o.label}
            onPress={() => {
              haptic.selection();
              onChange(o.value);
            }}
            style={[
              styles.segItem,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: colors.line },
              selected && { backgroundColor: colors.ink },
            ]}
          >
            <Text variant="bodyStrong" style={{ color: selected ? colors.paper : colors.ink }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Hairline ---------- */

export function Hairline({ inset = true }: { inset?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginHorizontal: inset ? margin : 0 }} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: margin, paddingTop: space[3], paddingBottom: space[3], gap: space[2] },
  headerSide: { minWidth: touchMin, alignItems: 'center' },
  iconBtn: { width: touchMin, height: touchMin, alignItems: 'center', justifyContent: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: margin, paddingTop: space[6], paddingBottom: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  tag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  empty: { paddingHorizontal: margin, paddingVertical: space[8], gap: space[4], alignItems: 'flex-start' },
  field: { gap: space[1] },
  input: { minHeight: touchMin, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control, paddingHorizontal: space[3], paddingVertical: space[2], fontFamily: fonts.regular, fontSize: 16 },
  fieldMsg: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  seg: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control, overflow: 'hidden' },
  segItem: { flex: 1, minHeight: touchMin, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] },
});
