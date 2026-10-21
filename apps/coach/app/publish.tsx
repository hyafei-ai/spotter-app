import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  REJECTION_GUIDANCE,
  STORE_LABEL,
  STORE_STATUSES,
  STORE_STATUS_LABEL,
  publishChecklist,
  publishReadiness,
  descriptionTemplate,
  type Store,
  type StoreStatus,
} from '@spotter/core';
import { Button, IconButton, ListRow, Screen, SectionLabel, SegmentedControl, Tag, Text, useTheme, useToast, margin, radius, space } from '@spotter/ui';
import { brandedTenant, useBrand } from '../src/brandStore';
import { confirm } from '../src/confirm';

const STATUS_TONE: Record<StoreStatus, 'neutral' | 'brand' | 'warning' | 'error' | 'success'> = {
  draft: 'neutral',
  building: 'brand',
  in_review: 'warning',
  live: 'success',
  rejected: 'error',
};

/** W-3 publishing assistant, phone version: status and checklist. Keys and the listing are handled on the web dashboard. */
export default function Publish() {
  const { colors } = useTheme();
  const toast = useToast();
  const { saved, publish, setStatus, revoke } = useBrand();
  const t = brandedTenant(saved);
  const readiness = publishReadiness(publish, saved, publish.description ?? descriptionTemplate(t));
  const steps = publishChecklist(publish);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Publish your app
        </Text>
        <Text color="ink2">
          {t.appName} goes out under your own Apple and Google accounts, so the listing, reviews and downloads are yours.
        </Text>
      </View>

      <SectionLabel>Store status</SectionLabel>
      {(['ios', 'android'] as Store[]).map((store, i) => {
        const status = publish.status[store];
        const rej = publish.rejection[store];
        const guide = rej ? REJECTION_GUIDANCE[rej.code] : undefined;
        return (
          <View key={store}>
            <ListRow title={STORE_LABEL[store]} subtitle={statusDetail(status)} right={<Tag label={STORE_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />} last={i === 1 && !rej} />
            {rej ? (
              <View style={[styles.rejection, { borderLeftColor: colors.error, backgroundColor: colors.surface }]} accessibilityRole="alert">
                <Text variant="label" color="ink2">
                  What {STORE_LABEL[store]} said
                </Text>
                <Text variant="callout">“{rej.message}”</Text>
                {guide ? (
                  <>
                    <Text variant="bodyStrong" style={{ marginTop: space[2] }}>
                      {guide.title}
                    </Text>
                    <Text variant="callout">{guide.fix}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {readiness.missingCredentials.length ? (
        <Text variant="callout" color="ink2" style={styles.body}>
          Keys missing for {readiness.missingCredentials.map((s) => STORE_LABEL[s]).join(' and ')}. Clients can use the shared Spotter app with your code until your app is live.
        </Text>
      ) : null}

      <SectionLabel right={<Text variant="caption" color="ink2">{`${doneCount} of ${steps.length} done`}</Text>}>Checklist</SectionLabel>
      {steps.map((s, i) => (
        <View key={s.key} style={[styles.step, { borderBottomColor: colors.line }]} accessibilityLabel={`${s.title}. ${s.done ? 'Done' : 'Not done'}. ${s.detail}`}>
          <Feather name={s.done ? 'check-circle' : 'circle'} size={20} color={s.done ? colors.success : colors.ink2} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">
              {i + 1}. {s.title}
            </Text>
            <Text variant="callout" color="ink2">
              {s.detail}
            </Text>
          </View>
        </View>
      ))}
      <View style={styles.body}>
        <Button label="Set up your brand" kind="secondary" icon="edit-3" onPress={() => router.push('/brand')} />
        <Text variant="caption" color="ink2" style={{ marginTop: space[2] }}>
          Uploading store keys, the icon and your listing needs a computer: open the web dashboard → Publish.
        </Text>
      </View>

      <SectionLabel>Demo</SectionLabel>
      <View style={styles.body}>
        <Text variant="callout" color="ink2">
          This preview has no build server. Set a status to see how each state looks.
        </Text>
        {(['ios', 'android'] as Store[]).map((store) => (
          <View key={store} style={{ gap: space[1], marginTop: space[3] }}>
            <Text variant="label" color="ink2">
              {STORE_LABEL[store]}
            </Text>
            <SegmentedControl
              label={`${STORE_LABEL[store]} demo status`}
              value={publish.status[store]}
              onChange={(v) =>
                setStatus(store, v, v === 'rejected' ? { code: store === 'ios' ? 'login_required' : 'data_safety', message: store === 'ios' ? 'We were unable to sign in with the demo account provided.' : 'Your Data safety form does not match the data your app collects.' } : undefined)
              }
              // Short labels so five options fit on a phone.
              options={STORE_STATUSES.map((s) => ({ value: s, label: s === 'in_review' ? 'Review' : STORE_STATUS_LABEL[s] }))}
            />
          </View>
        ))}
      </View>

      <SectionLabel>Leaving Spotter</SectionLabel>
      <View style={styles.body}>
        <Text variant="callout" color="ink2">
          Your store listings stay yours. Revoking deletes the store keys Spotter holds and stops any queued builds. Export your data from Me → Export first.
        </Text>
        <Button
          label="Revoke Spotter’s access"
          kind="quiet"
          icon="slash"
          onPress={() =>
            confirm('Revoke Spotter’s access?', 'Spotter won’t be able to build or submit your app until you upload new keys. This is recorded in your audit log.', 'Revoke', () => {
              revoke();
              toast({ message: 'Access revoked. Store keys deleted.' });
            })
          }
        />
      </View>
    </Screen>
  );
}

function statusDetail(s: StoreStatus): string {
  switch (s) {
    case 'draft':
      return 'Not submitted yet';
    case 'building':
      return 'Building your app. This usually takes 15–30 minutes.';
    case 'in_review':
      return 'Waiting for the store’s review, usually one to a few days.';
    case 'live':
      return 'Live. Clients can download it.';
    case 'rejected':
      return 'Not approved yet. See what to fix below.';
  }
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
  step: { flexDirection: 'row', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  rejection: { marginHorizontal: margin, marginBottom: space[3], padding: space[3], borderLeftWidth: 3, borderRadius: radius.control, gap: 2 },
});
