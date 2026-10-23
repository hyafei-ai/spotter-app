import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BODY_REGION_LABEL, returnGuidance, type BodyRegion, type PainLog } from '@spotter/core';
import { Button, SegmentedControl, Stepper, Text, TextField, useTheme, space, touchMin } from '@spotter/ui';
import { tenant } from '../env';
import { localDate } from '../nutrition/store';
import { useInjury } from './store';

/** Three short rows so every region fits on a phone. */
const REGION_ROWS: BodyRegion[][] = [
  ['neck', 'shoulder', 'elbow', 'wrist'],
  ['upper_back', 'lower_back', 'hip'],
  ['knee', 'ankle', 'foot', 'other'],
];
const SIDES = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
  { value: 'none', label: 'Middle' },
] as const;
type SideValue = (typeof SIDES)[number]['value'];

export const painLabel = (l: Pick<PainLog, 'region' | 'side' | 'level'>) =>
  `${l.side && l.side !== 'both' ? `${l.side === 'left' ? 'Left' : 'Right'} ${BODY_REGION_LABEL[l.region].toLowerCase()}` : BODY_REGION_LABEL[l.region]} · ${l.level}/10`;

/**
 * "Something hurting?" in the daily check: region, side, 0–10 and a note, saved as a pain log straight
 * away (independent of the rest of the check). Shared with the coach by default, per log.
 */
export function PainCheck() {
  const { colors } = useTheme();
  const logs = useInjury((s) => s.logs);
  const log = useInjury((s) => s.log);
  const first = tenant.coach.name.split(' ')[0] ?? '';
  const today = localDate();
  const todays = logs.filter((l) => l.date === today);
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<BodyRegion | null>(null);
  const [side, setSide] = useState<SideValue>('none');
  const [level, setLevel] = useState(3);
  const [note, setNote] = useState('');
  const [share, setShare] = useState(true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!region) return;
    setSaving(true);
    try {
      await log({ region, side: side === 'none' ? null : side, level, note: note.trim() ? note.trim().slice(0, 300) : null, shareWithCoach: share });
      setRegion(null);
      setNote('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: space[3] }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[styles.disclosure, { minHeight: touchMin }]}>
        <Text style={{ flex: 1 }}>Something hurting?</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.ink2} />
      </Pressable>
      {todays.map((l) => (
        <View key={l.id} style={{ gap: 2 }}>
          <Text variant="callout">{`Logged today: ${painLabel(l)}`}</Text>
          <Text variant="caption" color="ink2">
            {returnGuidance(l.region, l.level, first)[0]}
          </Text>
        </View>
      ))}
      {open ? (
        <>
          <Text variant="label" color="ink2">
            Where
          </Text>
          {REGION_ROWS.map((row, i) => (
            <SegmentedControl
              key={i}
              label={i === 0 ? 'Where it hurts: neck to wrist' : i === 1 ? 'Where it hurts: back and hip' : 'Where it hurts: knee to foot'}
              value={region && row.includes(region) ? region : null}
              onChange={setRegion}
              options={row.map((r) => ({ value: r, label: BODY_REGION_LABEL[r] }))}
            />
          ))}
          {region ? (
            <>
              <SegmentedControl label="Which side" value={side} onChange={setSide} options={SIDES.map((s) => ({ ...s }))} />
              <Stepper label="How much (0 none, 10 worst)" value={level} step={1} min={0} max={10} format={(v) => `${v}/10`} unitLabel="out of 10" onChange={setLevel} />
              <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} placeholder="Sharp on stairs, fine walking…" />
              <PainToggle label={`Share with ${first}`} value={share} onChange={setShare} />
              <Text variant="caption" color="ink2">
                {share ? `${first} sees where, how much and your note, so the program can work around it.` : `Kept private. ${first} won’t see this log.`}
              </Text>
              <Button label="Log it" kind="secondary" loading={saving} onPress={() => void save()} />
            </>
          ) : null}
          <Text variant="caption" color="ink2">
            Not a diagnosis. If it’s getting worse, see a doctor or physio.
          </Text>
        </>
      ) : null}
    </View>
  );
}

export function PainToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.toggle, { minHeight: touchMin }]}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.brand, false: colors.line }}
        thumbColor={colors.surface}
        {...{ activeThumbColor: colors.surface }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  disclosure: { flexDirection: 'row', alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
