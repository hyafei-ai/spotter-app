import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { BriefReason, DailyBrief, ReadTone } from '@spotter/core';
import { StrikeUnder, Text, useTheme, fonts, space } from '@spotter/ui';

/** The word the chalk-strike sits under, per tone ("running tired", "one thing to watch", "good to go"). */
const KEY_WORD: Record<ReadTone, string> = { ease: 'tired', watch: 'watch', steady: 'go' };

/**
 * Today's feel line as the screen's display type, with the chalk-strike under the key word
 * (docs/design/art-direction.md, pushed per docs/ux/client-ia-audit.md). Words wrap naturally; the strike
 * is drawn under one word only.
 */
export function FeelLine({ text, tone }: { text: string; tone: ReadTone }) {
  const words = text.replace(/\.$/, '').split(' ');
  const key = KEY_WORD[tone];
  return (
    <View style={styles.feel} accessible accessibilityRole="header" accessibilityLabel={text}>
      {words.map((w, i) => {
        const isKey = w.replace(/[^\p{L}’']/gu, '').toLowerCase() === key && words.findIndex((x) => x.replace(/[^\p{L}’']/gu, '').toLowerCase() === key) === i;
        const label = `${w}${i < words.length - 1 ? ' ' : ''}`;
        return isKey ? (
          <View key={i} style={styles.keyWord}>
            <Text style={styles.display}>{label}</Text>
            <View style={styles.strike}>
              <StrikeUnder />
            </View>
          </View>
        ) : (
          <Text key={i} style={styles.display}>
            {label}
          </Text>
        );
      })}
    </View>
  );
}

const ICON: Record<BriefReason['source'], keyof typeof Feather.glyphMap> = {
  sleep: 'moon',
  hrv: 'activity',
  resting_hr: 'heart',
  load: 'bar-chart-2',
  cycle: 'circle',
  fuel: 'coffee',
  pain: 'alert-circle',
  check: 'edit-3',
  symptoms: 'thermometer',
};

/** Where each reason's detail lives. */
export const REASON_HREF: Record<BriefReason['source'], Href> = {
  sleep: '/recovery',
  hrv: '/recovery',
  resting_hr: '/recovery',
  load: '/train',
  cycle: '/cycle',
  fuel: '/nutrition/fuel',
  pain: '/pain',
  check: '/check-today',
  symptoms: '/cycle',
};

const cut = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A reason in two or three plain words, no numbers: the chip. The full sentence is its accessible label. */
export function chipLabel(r: BriefReason): string {
  const t = r.text;
  switch (r.source) {
    case 'sleep':
      return /short|under|less|only/i.test(t) ? 'Short night' : 'Sleep on track';
    case 'hrv':
      return /under|low/i.test(t) ? 'HRV under usual' : 'HRV as usual';
    case 'resting_hr':
      return /over|up|high/i.test(t) ? 'Resting HR up' : 'Resting HR as usual';
    case 'load':
      return /similar|monotony/i.test(t) ? 'Same hard days' : /above|more|spike|jump|up/i.test(t) ? 'Big training week' : /below|less|drop|down/i.test(t) ? 'Lighter week' : 'Training load';
    case 'cycle':
      return cut(t.split(':')[0]!.replace(/\s*\(.*$/, ''));
    case 'fuel':
      return 'Fuelling';
    case 'pain':
      return cut(t.match(/^(.*? pain)/)?.[1] ?? 'Pain');
    case 'symptoms':
      return 'Symptoms today';
    case 'check':
      return cut(t.split('(')[0]!.trim().replace(/\.$/, ''));
  }
}

/** The brief's reasons as chips; each opens its detail. */
export function ReasonChips({ reasons }: { reasons: BriefReason[] }) {
  const { colors } = useTheme();
  if (!reasons.length) return null;
  return (
    <View style={styles.chips}>
      {reasons.map((r, i) => (
        <Pressable
          key={`${r.source}-${i}`}
          onPress={() => router.push(REASON_HREF[r.source])}
          accessibilityRole="button"
          accessibilityLabel={r.text}
          accessibilityHint="Opens the detail"
          style={({ pressed }) => [styles.chip, { borderColor: colors.line, backgroundColor: pressed ? colors.line : colors.surface }]}
        >
          <Feather name={ICON[r.source]} size={15} color={colors.ink} />
          <Text variant="callout" style={{ fontFamily: fonts.semibold }}>
            {chipLabel(r)}
          </Text>
          <Feather name="chevron-right" size={15} color={colors.ink2} />
        </Pressable>
      ))}
    </View>
  );
}

/** "What helps today": the brief's to-dos, minus the one the primary button already is. */
export function TodoLines({ brief, max = 2 }: { brief: DailyBrief; max?: number }) {
  // Only to-dos that belong to a reason shown as a chip (or general ones), so nothing appears without its why.
  const shown = new Set(brief.why.map((r) => r.source));
  const items = brief.todo
    .filter((t, i) => {
      const src = brief.todoSources?.[i];
      return !/easier version/i.test(t) && (src == null || shown.has(src));
    })
    .slice(0, max);
  if (!items.length) return null;
  return (
    <View style={{ gap: space[1] }}>
      {items.map((t) => (
        <View key={t} style={styles.todo}>
          <Text variant="callout" color="ink2">
            —
          </Text>
          <Text variant="callout" style={{ flex: 1 }}>
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  feel: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44 },
  keyWord: { position: 'relative' },
  strike: { position: 'absolute', left: -2, right: 8, bottom: -1, height: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1] + 2,
    minHeight: 40,
    paddingHorizontal: space[3],
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  todo: { flexDirection: 'row', gap: space[2] },
});
