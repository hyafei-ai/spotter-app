import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { recoveryDropLine, watchActivityType } from '@spotter/core';
import { Button, ListRow, Sheet, Text, margin, space } from '@spotter/ui';
import { IS_DEMO, tenant } from '../env';
import { watchNative } from './native';
import { NO_STATUS, type WatchStatus } from './types';
import { useWatch } from './store';
import { useWatchContext } from './context';

/**
 * Me → Connections → Apple Watch (docs/ux/watch.md §5): status first, then one line on what it does and one
 * action. Web and demo builds open the watch preview instead, so the redesign can be seen without a watch.
 */
export function WatchRow() {
  if (watchNative.available) return <LiveRow />;
  if (!IS_DEMO) return null;
  return (
    <ListRow
      title="Apple Watch"
      subtitle="See the watch app: today, the session, messages (preview)"
      chevron
      onPress={() => router.push('/watch-preview')}
    />
  );
}

function statusLine(s: WatchStatus, lastAt: string | null): string {
  if (!s.paired) return 'No Apple Watch paired with this iPhone';
  if (!s.installed) return `Install ${tenant.appName} on your watch from the Watch app`;
  if (s.pending > 0) return 'Sending today’s plan to your watch…';
  return lastAt ? `Ready on your watch · updated ${new Date(lastAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Ready on your watch';
}

function LiveRow() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<WatchStatus>(NO_STATUS);
  const lastAt = useWatch((s) => s.lastContextAt);
  const last = useWatch((s) => s.summaries[s.summaries.length - 1]);
  const ctx = useWatchContext();
  const [started, setStarted] = useState<boolean | null>(null);
  const first = tenant.coach.name.split(' ')[0] ?? '';

  useEffect(() => {
    let live = true;
    const read = () => void watchNative.status().then((s) => live && setStatus(s));
    read();
    const off = watchNative.onStatus(read);
    return () => {
      live = false;
      off();
    };
  }, []);

  const plan = ctx.plans[0];
  const recovery = last ? recoveryDropLine(last.hrr60, last.hrr120) : null;

  return (
    <>
      <ListRow title="Apple Watch" subtitle={statusLine(status, lastAt)} chevron onPress={() => setOpen(true)} />
      <Sheet visible={open} title="Apple Watch" onClose={() => setOpen(false)}>
        <View style={styles.body}>
          <Text>{statusLine(status, lastAt)}</Text>
          <Text color="ink2">
            {`Today’s session from ${first} on your wrist: log sets with the crown, rest timer, heart rate, and ${first}’s messages. Works without your phone nearby and sends everything when it’s back.`}
          </Text>
          {last ? (
            <Text variant="caption" color="ink2">
              {`Last watch session: ${last.title}${recovery ? ` · ${recovery}` : ''}`}
            </Text>
          ) : null}
          {status.installed && plan ? (
            <>
              <Button
                label={started === false ? 'Couldn’t reach your watch. Open the app on it.' : started ? `Started on your watch` : `Start ${plan.label} on your watch`}
                onPress={() => void watchNative.startOnWatch(plan.planId, watchActivityType(plan)).then(setStarted)}
              />
              <Text variant="caption" color="ink2">
                Wakes the watch app even if it’s asleep, and opens straight into the first set.
              </Text>
            </>
          ) : !status.installed && status.paired ? (
            <Button label="Open the Watch app" kind="secondary" onPress={() => void Linking.openURL('itms-watchs://').catch(() => {})} />
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({ body: { paddingHorizontal: margin, gap: space[3] } });
