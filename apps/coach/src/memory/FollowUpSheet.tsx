import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { isoDay } from '@spotter/core/demo';
import { Button, Sheet, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { useMemory } from './store';

const daysUntilMonday = () => {
  const d = new Date().getDay(); // 0 Sun … 6 Sat
  return d === 1 ? 7 : (8 - d) % 7;
};

const CHOICES = [
  { key: 'tomorrow', label: 'Tomorrow', days: () => 1 },
  { key: 'monday', label: 'Monday', days: daysUntilMonday },
  { key: 'week', label: 'In a week', days: () => 7 },
] as const;

const valid = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && s >= isoDay(0);
const shown = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/** "Remind me": the coach writes what to ask and picks a day; it shows up in Clients that morning. */
export function FollowUpSheet({
  clientId,
  firstName,
  visible,
  onClose,
}: {
  clientId: string;
  firstName: string;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={`Remind me about ${firstName}`} onClose={onClose}>
      {/* Mounted only while open, so every reminder starts blank. */}
      {visible ? <FollowUpForm clientId={clientId} onClose={onClose} /> : null}
    </Sheet>
  );
}

function FollowUpForm({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const add = useMemory((s) => s.addFollowUp);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string>('monday');
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = CHOICES.find((c) => c.key === choice);
  const dueOn = preset ? isoDay(preset.days()) : custom.trim();
  const ok = text.trim().length > 0 && valid(dueOn);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await add(clientId, text, dueOn);
      onClose();
      toast({ message: `We’ll remind you on ${shown(dueOn)}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the reminder. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.body}>
      <TextField
        label="What to ask about"
        value={text}
        onChangeText={setText}
        placeholder="e.g. Ask about knee"
        maxLength={200}
        autoFocus
      />
      <Text variant="label" color="ink2">
        When
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="When">
        {[
          ...CHOICES.map((c) => ({ key: c.key as string, label: c.label })),
          { key: 'custom', label: 'Pick a date' },
        ].map((c) => {
          const on = c.key === choice;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              onPress={() => setChoice(c.key)}
              style={[
                styles.chip,
                {
                  borderColor: on ? colors.ink : colors.line,
                  backgroundColor: on ? colors.ink : 'transparent',
                },
              ]}
            >
              <Text variant="bodyStrong" style={{ color: on ? colors.paper : colors.ink }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {choice === 'custom' ? (
        <TextField
          label="Date"
          value={custom}
          onChangeText={setCustom}
          placeholder={isoDay(3)}
          hint="Year-month-day, today or later"
          error={
            custom.trim() && !valid(custom.trim())
              ? 'Use a date from today on, like ' + isoDay(3)
              : undefined
          }
          autoCorrect={false}
        />
      ) : null}
      {error ? (
        <Text variant="callout" color="error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        label={valid(dueOn) ? `Remind me ${shown(dueOn)}` : 'Remind me'}
        icon="bell"
        loading={saving}
        disabled={!ok}
        disabledReason={!text.trim() ? 'Write what to ask about first.' : 'Pick a day.'}
        onPress={() => void save()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, gap: space[3], paddingBottom: space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space[4],
    minHeight: 44,
    justifyContent: 'center',
  },
});
