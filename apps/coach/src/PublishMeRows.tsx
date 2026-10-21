import { router } from 'expo-router';
import { STORE_STATUS_LABEL } from '@spotter/core';
import { ListRow, SectionLabel } from '@spotter/ui';
import { useBrand } from './brandStore';

/** Coach Me rows for W-1/W-3: brand setup and the publishing assistant. */
export function PublishMeRows() {
  const { saved, publish } = useBrand();
  const status =
    publish.status.ios === 'draft' && publish.status.android === 'draft'
      ? 'Not published yet. Clients can use the shared Spotter app with your code.'
      : `App Store: ${STORE_STATUS_LABEL[publish.status.ios]} · Google Play: ${STORE_STATUS_LABEL[publish.status.android]}`;
  return (
    <>
      <SectionLabel>Your app</SectionLabel>
      <ListRow title="Brand" subtitle={`${saved.appName} · ${saved.brandColor} · ${saved.units}`} chevron onPress={() => router.push('/brand')} />
      <ListRow title="Publish" subtitle={status} chevron last onPress={() => router.push('/publish')} />
    </>
  );
}
