import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { buildTriage, reasonText, type ClientTriage } from '@spotter/core';
import {
  EmptyState,
  IconButton,
  ListRow,
  Monogram,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  TextField,
  useTheme,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import type { DemoClient } from '@spotter/core/demo';
import { getAuth, useAuth, useTriageRealtime } from '@spotter/ui/platform';
import { initials, useCoach } from '../../src/store';
import { tenant } from '../../src/env';
import { SwipeRow } from '../../src/platform/SwipeRow';
import { useRole, useVisibleClientIds } from '../../src/platform/team';
import { requestedClientIds, triageForViewer, useDemoCheckInRequests } from '../../src/retention/store';
import { useCheckInDone } from '../../src/retention/CheckInDone';
import { loadCoachData, saveTriage } from '../../src/platform/serverData';
import { PrepCard } from '../../src/memory/PrepCard';
import { useMemoryTriage } from '../../src/memory/useClientMemory';
import { AtRiskList } from '../../src/atrisk/AtRiskList';

type Filter = 'needs' | 'all' | 'attention' | 'new' | 'paused' | 'payment';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'needs', label: 'Needs you' },
  { value: 'all', label: 'All' },
  // Who could use a check-in, with reasons from what each athlete shared (src/atrisk).
  { value: 'attention', label: 'Needs attention' },
  { value: 'new', label: 'New' },
  { value: 'paused', label: 'Paused' },
  { value: 'payment', label: 'Payment issue' },
];

/** K-1 triage: sorted by who needs the coach, each row with a plain-language reason. */
export default function Clients() {
  const { colors } = useTheme();
  const toast = useToast();
  const { clients: allClients, triage: allTriage, markHandled, restore, snooze } = useCoach();
  const [filter, setFilter] = useState<Filter>('needs');
  const [query, setQuery] = useState('');
  const [actionsFor, setActionsFor] = useState<DemoClient | null>(null);
  const [prepFor, setPrepFor] = useState<DemoClient | null>(null);
  const auth = useAuth();
  // Due follow-ups and body-variance reasons (short sleep, load spike) join the list.
  useMemoryTriage();

  // Assistants see only their assigned clients (K-8). Connected builds get this from RLS as well.
  // Check-in requests from the owner are addressed to one coach, who sees that member too (retention).
  const { viewerId } = useRole();
  useDemoCheckInRequests();
  const checkIn = useCheckInDone();
  const baseVisible = useVisibleClientIds();
  const visible = useMemo(
    () => (baseVisible ? new Set([...baseVisible, ...requestedClientIds(allTriage, viewerId)]) : null),
    [baseVisible, allTriage, viewerId],
  );
  const clients = useMemo(() => (visible ? allClients.filter((c) => visible.has(c.id)) : allClients), [allClients, visible]);
  const triage = useMemo(
    () => triageForViewer(visible ? allTriage.filter((t) => visible.has(t.clientId)) : allTriage, viewerId),
    [allTriage, visible, viewerId],
  );

  // Live: triage:<tenant_id>:<coach_id> refreshes the list when anything changes (connected builds).
  const refresh = useCallback(() => void loadCoachData().catch(() => {}), []);
  useTriageRealtime(auth.status === 'signedIn' ? tenant.id : null, auth.userId, refresh);

  const rows = useMemo(() => buildTriage(triage), [triage]);
  const byClient = new Map(rows.map((r) => [r.clientId, r]));
  const q = query.trim().toLowerCase();

  const list: { client: DemoClient; triage?: ClientTriage }[] = useMemo(() => {
    const ordered =
      filter === 'needs'
        ? rows.map((r) => clients.find((c) => c.id === r.clientId)!).filter(Boolean)
        : [...clients].sort((a, b) => (byClient.get(b.id)?.priority ?? 0) - (byClient.get(a.id)?.priority ?? 0) || a.name.localeCompare(b.name));
    return ordered
      .filter((c) => {
        if (filter === 'new') return c.status === 'new';
        if (filter === 'paused') return c.status === 'paused';
        if (filter === 'payment') return c.flags.includes('payment');
        return true;
      })
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((client) => ({ client, triage: byClient.get(client.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, clients, filter, q]);

  const handled = (c: DemoClient) => {
    // An open check-in request asks how they checked in first; that also clears the rest.
    const open = triage.filter((t) => t.clientId === c.id && !t.handledAt);
    if (
      checkIn.ask(c.name, open, () => {
        const items = markHandled(c.id);
        void saveTriage(items.map((i) => i.id).filter((id) => !id.startsWith('req-')), { handled_at: new Date().toISOString(), handled_by: getAuth().userId });
      })
    ) {
      setActionsFor(null);
      return;
    }
    const items = markHandled(c.id);
    setActionsFor(null);
    const ids = items.map((i) => i.id);
    void saveTriage(ids, { handled_at: new Date().toISOString(), handled_by: getAuth().userId });
    toast({
      message: `${c.name.split(' ')[0]} marked handled`,
      actionLabel: 'Undo',
      onAction: () => {
        restore(items);
        void saveTriage(ids, { handled_at: null, handled_by: null });
      },
    });
  };

  const snoozeFor = (c: DemoClient, days: number, label: string) => {
    const until = new Date();
    until.setDate(until.getDate() + days);
    until.setHours(7, 0, 0, 0);
    snooze(c.id, until);
    void saveTriage(
      triage.filter((t) => t.clientId === c.id && !t.handledAt).map((t) => t.id),
      { snoozed_until: until.toISOString() },
    );
    setActionsFor(null);
    toast({ message: `${c.name.split(' ')[0]} snoozed until ${label.toLowerCase()}` });
  };

  const needCount = rows.length;

  return (
    <Screen scroll={false}>
      <ScreenHeader
        title="Clients"
        subtitle={needCount ? `${needCount} need you today` : 'Nobody needs you right now'}
        right={<IconButton icon="user-plus" label="Invite a client" onPress={() => router.push('/invite')} />}
      />
      <View style={styles.search}>
        <TextField label="Search clients" value={query} onChangeText={setQuery} placeholder="Name" autoCorrect={false} returnKeyType="search" />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
          {FILTERS.map((f) => {
            const on = f.value === filter;
            return (
              <Pressable
                key={f.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.value)}
                style={[styles.chip, { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : 'transparent' }]}
              >
                <Text variant="bodyStrong" style={{ color: on ? colors.paper : colors.ink }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {filter !== 'attention' && list.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push(
              `/bulk-message?ids=${list.map((r) => r.client.id).join(',')}&label=${encodeURIComponent(q ? 'matching clients' : (FILTERS.find((f) => f.value === filter)?.label ?? 'clients'))}`,
            )
          }
          style={styles.bulk}
          hitSlop={4}
        >
          <Feather name="send" size={16} color={colors.brand} />
          <Text variant="bodyStrong" style={{ color: colors.brand }}>
            Message these {list.length} clients
          </Text>
        </Pressable>
      ) : null}
      {filter === 'attention' && clients.length > 0 ? (
        <AtRiskList visibleIds={clients.map((c) => c.id)} query={query} />
      ) : clients.length === 0 ? (
        <EmptyState message="No clients yet. Send your first invite and they’ll show up here." actionLabel="Invite a client" onAction={() => router.push('/invite')} />
      ) : list.length === 0 ? (
        <EmptyState
          message={filter === 'needs' && !q ? 'All clear. Nobody needs you right now.' : 'No clients match.'}
          actionLabel={filter !== 'all' ? 'Show all clients' : undefined}
          onAction={() => {
            setFilter('all');
            setQuery('');
          }}
        />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(r) => r.client.id}
          renderItem={({ item, index }) => {
            const t = item.triage;
            const more = t && t.items.length > 1 ? `+${t.items.length - 1} more · ` : '';
            const c = item.client;
            return (
              <SwipeRow
                left={[{ label: 'Reply', icon: 'message-square', tone: 'brand', onPress: () => router.push(`/client/${c.id}/thread`) }]}
                right={
                  t
                    ? [
                        { label: 'Snooze', icon: 'clock', tone: 'ink', onPress: () => snoozeFor(c, 1, 'Tomorrow') },
                        { label: 'Handled', icon: 'check', tone: 'success', onPress: () => handled(c) },
                      ]
                    : undefined
                }
              >
                <View style={{ backgroundColor: colors.paper }}>
                  <ListRow
                    left={<Monogram initials={initials(c.name)} size={40} />}
                    title={c.name}
                    reason={t ? reasonText(t.top) : undefined}
                    subtitle={`${more}${c.status === 'paused' ? 'Paused · ' : ''}${c.plan}`}
                    onPress={() => router.push(`/client/${c.id}`)}
                    accessibilityHint="Swipe right to reply, left to mark handled or snooze. Actions are also in the more button."
                    right={<IconButton icon="more-horizontal" label={`Actions for ${c.name}`} onPress={() => setActionsFor(c)} />}
                    last={index === list.length - 1}
                  />
                </View>
              </SwipeRow>
            );
          }}
        />
      )}

      <Sheet visible={!!actionsFor} title={actionsFor?.name ?? ''} onClose={() => setActionsFor(null)}>
        {actionsFor ? (
          <>
            <ListRow
              title="Prep"
              subtitle="30 seconds before you talk"
              left={<Feather name="clipboard" size={20} color={colors.ink2} />}
              onPress={() => {
                const c = actionsFor;
                setActionsFor(null);
                setPrepFor(c);
              }}
            />
            <ListRow
              title="Reply"
              left={<Feather name="message-square" size={20} color={colors.ink2} />}
              onPress={() => {
                const c = actionsFor;
                setActionsFor(null);
                router.push(`/client/${c.id}/thread`);
              }}
            />
            {byClient.has(actionsFor.id) ? (
              <>
                <ListRow title="Mark handled" left={<Feather name="check" size={20} color={colors.ink2} />} onPress={() => handled(actionsFor)} />
                <ListRow title="Snooze until tomorrow" left={<Feather name="clock" size={20} color={colors.ink2} />} onPress={() => snoozeFor(actionsFor, 1, 'Tomorrow')} />
                <ListRow title="Snooze for a week" left={<Feather name="calendar" size={20} color={colors.ink2} />} last onPress={() => snoozeFor(actionsFor, 7, 'Next week')} />
              </>
            ) : null}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!prepFor} title={prepFor ? `Prep: ${prepFor.name}` : ''} onClose={() => setPrepFor(null)}>
        {prepFor ? (
          <View style={styles.prep}>
            <PrepCard clientId={prepFor.id} inset={false} />
            <ListRow
              title={`Open ${prepFor.name.split(' ')[0]}`}
              chevron
              last
              onPress={() => {
                const c = prepFor;
                setPrepFor(null);
                router.push(`/client/${c.id}`);
              }}
            />
          </View>
        ) : null}
      </Sheet>
      {checkIn.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: margin, paddingBottom: space[3] },
  chips: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[3] },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space[4], minHeight: 44, justifyContent: 'center' },
  prep: { paddingHorizontal: margin, gap: space[2] },
  bulk: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: margin, minHeight: 44, alignSelf: 'flex-start' },
});
