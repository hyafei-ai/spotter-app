import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { TRAINER_STYLES, TRAINER_STYLE_EXAMPLE, TRAINER_STYLE_LABEL, type TrainerStyle } from '@spotter/core';
import { Button, IconButton, Screen, Text, useTheme, useToast, margin, space } from '@spotter/ui';
import { useStyles } from '../src/multisport/styles';

/**
 * How do you coach? (docs/ux/multisport.md section 6). Pick any number; nothing is hidden by the choice, it only
 * changes what comes first and the words used. Skipping keeps every style in the default order.
 */
export default function Styles() {
  const { colors } = useTheme();
  const toast = useToast();
  const saved = useStyles((s) => s.styles);
  const save = useStyles((s) => s.set);
  const [picked, setPicked] = useState<TrainerStyle[]>(saved);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/programs'));
  const toggle = (s: TrainerStyle) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  return (
    <Screen
      footer={
        <Button
          label={picked.length ? 'Save' : 'Save: show everything'}
          onPress={() => {
            save(picked);
            toast({ message: picked.length ? 'Saved. Your styles come first in the builder.' : 'Saved. Every style, in the usual order.' });
            back();
          }}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          How do you coach?
        </Text>
        <Text variant="callout" color="ink2">
          Pick all that fit. Your styles come first when you add to a session, in templates and in each client’s results. Nothing is hidden.
        </Text>
      </View>
      <View style={styles.list} accessibilityRole="list">
        {TRAINER_STYLES.map((s) => {
          const on = picked.includes(s);
          return (
            <Pressable
              key={s}
              onPress={() => toggle(s)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${TRAINER_STYLE_LABEL[s]}. ${TRAINER_STYLE_EXAMPLE[s]}`}
              style={({ pressed }) => [styles.row, { borderBottomColor: colors.line, backgroundColor: pressed ? colors.surface : 'transparent' }]}
            >
              <View style={[styles.box, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent' }]}>
                {on ? <Feather name="check" size={16} color={colors.brandInk} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{TRAINER_STYLE_LABEL[s]}</Text>
                <Text variant="callout" color="ink2">
                  {TRAINER_STYLE_EXAMPLE[s]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[3] },
  list: { paddingTop: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
