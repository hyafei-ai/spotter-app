import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme, radius, space } from '@spotter/ui';
import { kv } from '../storage';
import { tenant } from '../env';

/**
 * Tap-to-explain for the terms people don't know yet (docs/ux/first-value.md: "every term has a tap-to-explain
 * line the first time"). The first time a term appears, its line is open; after that it folds into a quiet
 * "What's this?" the person can tap. Plain words, no numbers, no diagnosis.
 */

export type Term = 'hrv' | 'ea' | 'phase' | 'resting_hr' | 'usual';

export const TERM_TITLE: Record<Term, string> = {
  hrv: 'What’s HRV?',
  ea: 'What’s energy availability?',
  phase: 'What’s a cycle phase?',
  resting_hr: 'What’s resting heart rate?',
  usual: 'What’s “your usual”?',
};

export const TERM_TEXT: Record<Term, string> = {
  hrv: 'HRV (heart-rate variability) is the tiny change in time between heartbeats, measured by your watch overnight. Lower than your usual often means your body is still recovering from a hard week, a short night, stress or illness. Only your own usual matters, not anyone else’s number.',
  ea: 'Energy availability is the food energy left for your body after training. When it runs low for a while, recovery, hormones and bones can suffer. Spotter compares what you eat with what you burn, as a screen, not a diagnosis.',
  phase: 'Your cycle has phases: your period, the follicular phase after it, ovulation, and the luteal phase before your next period. Some people lift a little lower in some phases. Spotter only adjusts once your own data shows it.',
  resting_hr: 'Your heart rate at rest, measured by your watch. A few beats above your usual can mean you’re tired, stressed or getting ill.',
  usual: 'Your usual is your own average over the last four weeks. Everything here is compared with you, never with other people.',
};

const useSeen = create<{ seen: Term[]; mark(t: Term): void }>()(
  persist((set, get) => ({ seen: [], mark: (t) => (get().seen.includes(t) ? undefined : set({ seen: [...get().seen, t] })) }), {
    name: `spotter.explained.${tenant.slug}`,
    storage: createJSONStorage(() => kv),
  }),
);

export function Explain({ term }: { term: Term }) {
  const { colors } = useTheme();
  // Open the first time this term is ever shown (after the seen list has loaded), folded after that.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const go = () => {
      const seen = useSeen.getState().seen.includes(term);
      setOpen((o) => o ?? !seen);
      useSeen.getState().mark(term);
    };
    if (useSeen.persist.hasHydrated()) go();
    else return useSeen.persist.onFinishHydration(go);
  }, [term]);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: !!open }}
        accessibilityLabel={TERM_TITLE[term]}
        hitSlop={8}
        style={styles.toggle}
      >
        <Feather name="info" size={14} color={colors.ink2} />
        <Text variant="caption" color="ink2" style={{ textDecorationLine: 'underline' }}>
          {TERM_TITLE[term]}
        </Text>
      </Pressable>
      {open ? (
        <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text variant="callout">{TERM_TEXT[term]}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[1], alignSelf: 'flex-start', minHeight: 32 },
  box: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control, padding: space[3], marginTop: space[1] },
});
