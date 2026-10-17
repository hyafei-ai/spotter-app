import { StyleSheet, View } from 'react-native';
import { LOWER_A } from '@spotter/core/demo';
import { formatWeight } from '@spotter/core';
import { ListRow, Screen, ScreenHeader, SectionLabel, Tag, Text, margin, space } from '@spotter/ui';
import { tenant } from '../../src/env';

/** K-4 (read-only in this build). MOCK: one sample day from the demo program. */
export default function Programs() {
  return (
    <Screen>
      <ScreenHeader title="Programs" />
      <SectionLabel>Strength Base · week 3 · Lower A</SectionLabel>
      {LOWER_A.exercises.map((e, i) => {
        const p = e.sets[0]!;
        const reps = p.repsMin != null && p.repsMax != null && p.repsMin !== p.repsMax ? `${p.repsMin}–${p.repsMax}` : `${p.repsMax ?? ''}`;
        const dose =
          e.metric === 'distance'
            ? `${e.sets.length} × ${p.distanceM} m`
            : `${e.sets.length} × ${reps}${p.loadKg != null ? ` · ${formatWeight(p.loadKg, tenant.units)}` : ''}${p.rpe ? ` @ RPE ${p.rpe}` : ''}`;
        const rule = e.progressionRule
          ? `+${formatWeight(e.progressionRule.incrementKg, tenant.units)} when top of range hit at ≤ RPE ${e.progressionRule.maxRpe} for ${e.progressionRule.sessionsRequired} sessions`
          : undefined;
        return (
          <ListRow
            key={e.id}
            title={e.name}
            subtitle={[dose, `rest ${e.restS ? `${e.restS} s` : 'none (superset)'}`, rule].filter(Boolean).join(' · ')}
            right={e.supersetGroup ? <Tag label={`Superset ${e.supersetGroup}`} /> : undefined}
            last={i === LOWER_A.exercises.length - 1}
          />
        );
      })}
      <View style={styles.note}>
        <Text variant="callout" color="ink2">
          Edits to a live program apply to future sessions only. Building and assigning programs from the phone is the next build.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ note: { paddingHorizontal: margin, paddingTop: space[4] } });
