import { Banner, haptic } from '@spotter/ui';
import { useEffect, useRef } from 'react';
import { syncQueue, useSync } from './sync';

/** "Saved on phone, will sync" when offline; a warning with Retry when something failed. Silent when synced. */
export function SyncBanner() {
  const { status, online } = useSync();
  const prev = useRef(status.kind);
  useEffect(() => {
    if (status.kind === 'failed' && prev.current !== 'failed') haptic.warning();
    prev.current = status.kind;
  }, [status.kind]);

  if (status.kind === 'failed') {
    const n = status.pending + status.rejected;
    const what = n === 1 ? '1 change hasn’t synced' : `${n} changes haven’t synced`;
    return (
      <Banner
        tone="warning"
        message={`${what}. It’s saved on your phone. ${status.rejected ? status.message : ''}`.trim()}
        actionLabel="Retry"
        onAction={() => void syncQueue.retryAll()}
      />
    );
  }
  if (!online) return <Banner message="Saved on phone, will sync" />;
  return null;
}
