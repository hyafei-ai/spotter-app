import { StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  MODULE_LABEL,
  TAB_LABEL_OPTIONS,
  brandProblems,
  colorReport,
  onColor,
  type BrandDraft,
  type BrandField,
  type ModuleKey,
  type TabKey,
} from '@spotter/core';
import { Button, IconButton, palette, Screen, SectionLabel, SegmentedControl, Text, TextField, useTheme, useToast, margin, radius, space } from '@spotter/ui';
import { tenant } from '../src/env';
import { useBrand } from '../src/brandStore';
import { confirm } from '../src/confirm';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const TAB_NAMES: Record<TabKey, string> = { today: 'First tab', history: 'Second tab', coach: 'Messages tab', me: 'Last tab' };

/** W-1 brand setup, phone version. Icon and logo uploads (which need pixel checks) are on the web dashboard. */
export default function BrandSetup() {
  const { colors } = useTheme();
  const toast = useToast();
  const { draft, dirty, edit, save, discard } = useBrand();
  const problems = brandProblems(draft);
  const err = (f: BrandField) => problems.find((p) => p.field === f)?.message;
  const report = colorReport(draft.brandColor);
  const first = tenant.coach.name.split(' ')[0] ?? 'Coach';

  const leave = () => {
    const go = () => (router.canGoBack() ? router.back() : router.replace('/me'));
    if (!dirty) return go();
    confirm('Discard changes?', 'Your brand edits haven’t been saved.', 'Discard', () => {
      discard();
      go();
    });
  };

  return (
    <Screen
      footer={
        <Button
          label="Save brand"
          onPress={() => save() && toast({ message: 'Saved. Clients see it next time they open the app.' })}
          disabled={!dirty || problems.length > 0}
          disabledReason={problems[0]?.message ?? (!dirty ? 'No changes yet' : undefined)}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={leave} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Brand
        </Text>
        <Text color="ink2">How your clients’ app looks. Upload the icon and logo on the web dashboard.</Text>
      </View>

      <Preview draft={draft} coachFirst={first} />

      <SectionLabel>Name</SectionLabel>
      <View style={styles.form}>
        <TextField label={`App name · ${draft.appName.length}/30`} value={draft.appName} onChangeText={(appName) => edit({ appName })} error={err('appName')} maxLength={40} />
        <TextField label={`Short name · ${draft.shortName.length}/12`} hint="Shown under the app icon." value={draft.shortName} onChangeText={(shortName) => edit({ shortName })} error={err('shortName')} maxLength={20} />
      </View>

      <SectionLabel>Colour</SectionLabel>
      <View style={styles.form}>
        <View style={styles.colorRow}>
          <View style={{ flex: 1 }}>
            <TextField label="Accent colour" value={draft.brandColor} onChangeText={(v) => edit({ brandColor: v.trim().toUpperCase() })} autoCapitalize="characters" autoCorrect={false} maxLength={7} />
          </View>
          <View accessibilityLabel={`Light mode swatch ${draft.brandColor}`} style={[styles.swatch, { backgroundColor: HEX.test(draft.brandColor) ? draft.brandColor : colors.line, borderColor: colors.line }]} />
          {report ? <View accessibilityLabel={`Dark mode shade ${report.dark}`} style={[styles.swatch, { backgroundColor: report.dark, borderColor: colors.line }]} /> : null}
        </View>
        {report ? (
          <View style={[styles.report, { borderLeftColor: report.ok ? colors.success : colors.warning, backgroundColor: colors.surface }]} accessibilityLiveRegion="polite">
            <View style={styles.reportLine}>
              <Feather name={report.ok ? 'check-circle' : 'alert-circle'} size={16} color={report.ok ? colors.success : colors.warning} />
              <Text variant="bodyStrong">{report.ok ? `Readable: ${report.ratio.toFixed(1)}:1 on the app background` : `Too light: ${report.ratio.toFixed(1)}:1 (needs 4.5:1)`}</Text>
            </View>
            {!report.ok ? (
              <Button label={`Use ${report.suggestion}, the nearest readable shade`} kind="quiet" full={false} onPress={() => edit({ brandColor: report.suggestion })} />
            ) : null}
            <Text variant="caption" color="ink2">
              Dark mode uses {report.dark} automatically ({report.darkRatio.toFixed(1)}:1).
            </Text>
          </View>
        ) : (
          <Text variant="caption" color="error">
            Use a 6-digit hex colour, like #C2410C.
          </Text>
        )}
        <TextField label="Splash screen background" value={draft.splashBackground} onChangeText={(v) => edit({ splashBackground: v.trim().toUpperCase() })} autoCapitalize="characters" maxLength={7} error={err('splashBackground')} />
      </View>

      <SectionLabel>Words</SectionLabel>
      <View style={styles.form}>
        <TextField label="Welcome message" hint="New clients see this first, in your words." value={draft.welcomeMessage} onChangeText={(welcomeMessage) => edit({ welcomeMessage })} multiline error={err('welcomeMessage')} />
        <TextField label="Support email" value={draft.supportEmail} onChangeText={(supportEmail) => edit({ supportEmail })} keyboardType="email-address" autoCapitalize="none" error={err('supportEmail')} />
        <TextField label="Privacy policy link" value={draft.privacyPolicyUrl} onChangeText={(privacyPolicyUrl) => edit({ privacyPolicyUrl })} keyboardType="url" autoCapitalize="none" error={err('privacyPolicyUrl')} />
        <View style={{ gap: space[2] }}>
          <Text variant="label" color="ink2">
            Units
          </Text>
          <SegmentedControl label="Units" value={draft.units} onChange={(units) => edit({ units })} options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]} />
        </View>
      </View>

      <SectionLabel>Tabs</SectionLabel>
      <View style={styles.form}>
        {(Object.keys(TAB_LABEL_OPTIONS) as TabKey[]).map((k) => (
          <View key={k} style={{ gap: space[2] }}>
            <Text variant="label" color="ink2">
              {TAB_NAMES[k]}
            </Text>
            <SegmentedControl
              label={TAB_NAMES[k]}
              value={draft.tabs[k]}
              onChange={(v) => edit({ tabs: { ...draft.tabs, [k]: v } })}
              options={TAB_LABEL_OPTIONS[k].map((o) => ({ value: o, label: o === '{coach}' ? first : o }))}
            />
          </View>
        ))}
      </View>

      <SectionLabel>Features</SectionLabel>
      {(Object.keys(MODULE_LABEL) as ModuleKey[]).map((m) => (
        <View key={m} style={[styles.toggle, { borderBottomColor: colors.line }]}>
          <Text style={{ flex: 1 }}>{MODULE_LABEL[m]}</Text>
          <Switch
            value={draft.modules[m]}
            onValueChange={(on) => edit({ modules: { ...draft.modules, [m]: on } })}
            accessibilityLabel={MODULE_LABEL[m]}
            trackColor={{ true: colors.brand, false: colors.line }}
            thumbColor={colors.surface}
            {...{ activeThumbColor: colors.surface }}
          />
        </View>
      ))}
      <Text variant="caption" color="ink2" style={styles.note}>
        Switching a feature off hides it from clients. Nothing they’ve already logged is deleted.
      </Text>
    </Screen>
  );
}

/** A small, honest mock of the client app's header and main button in this brand. */
function Preview({ draft, coachFirst }: { draft: BrandDraft; coachFirst: string }) {
  const { colors } = useTheme();
  const accent = HEX.test(draft.brandColor) ? draft.brandColor : colors.ink2;
  const tabs = (Object.keys(TAB_LABEL_OPTIONS) as TabKey[]).map((k) => (draft.tabs[k] === '{coach}' ? coachFirst : draft.tabs[k]));
  return (
    <View style={[styles.preview, { borderColor: colors.line }]} accessibilityLabel={`Preview of ${draft.appName || 'your app'}`}>
      <Text variant="label" color="ink2">
        Preview
      </Text>
      <View style={[styles.phone, { backgroundColor: palette.light.paper, borderColor: colors.line }]}>
        <Text variant="title" style={{ color: palette.light.ink }} numberOfLines={1}>
          Lower A
        </Text>
        <Text variant="caption" style={{ color: palette.light.ink2 }} numberOfLines={1}>
          {draft.appName || 'Your app'}
        </Text>
        <View style={[styles.previewNote, { borderLeftColor: accent }]}>
          <Text variant="caption" style={{ color: palette.light.ink }} numberOfLines={2}>
            {draft.welcomeMessage || 'Your welcome message'}
          </Text>
        </View>
        <View style={[styles.previewButton, { backgroundColor: accent }]}>
          <Text variant="bodyStrong" style={{ color: HEX.test(accent) ? onColor(accent) : '#FFFFFF' }}>
            Start Lower A
          </Text>
        </View>
        <View style={styles.previewTabs}>
          {tabs.map((t, i) => (
            <Text key={i} variant="caption" style={{ color: i === 0 ? accent : palette.light.ink2, flex: 1, textAlign: 'center' }} numberOfLines={1}>
              {t}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  form: { paddingHorizontal: margin, paddingTop: space[4], gap: space[4] },
  colorRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  swatch: { width: 48, height: 48, borderRadius: radius.control, borderWidth: 1 },
  report: { borderLeftWidth: 3, borderRadius: radius.control, padding: space[3], gap: space[1] },
  reportLine: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: margin, borderBottomWidth: StyleSheet.hairlineWidth },
  note: { paddingHorizontal: margin, paddingTop: space[3] },
  preview: { marginHorizontal: margin, marginTop: space[4], gap: space[2] },
  phone: { borderWidth: 1, borderRadius: radius.sheet, padding: space[4], gap: space[2] },
  previewNote: { borderLeftWidth: 3, paddingLeft: space[2] },
  previewButton: { borderRadius: radius.control, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: space[1] },
  previewTabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.light.line, paddingTop: space[2], marginTop: space[1] },
});
