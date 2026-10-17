import { useMemo, useState } from 'react';
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
import { initials, useCoach } from '../../src/store';

type Filter = 'needs' | 'all' | 'new' | 'paused' | 'payment';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'needs', label: 'Needs you' },
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'paused', label: 'Paused' },
  { value: 'payment', label: 'Payment issue' },
];

/** K-1 triage: sorted by who needs the coach, each row with a plain-language reason. */
export default function Clients() {
  const { colors } = useTheme();
  const toast = useToast();
  const { clients, triage, markHandled, restore, snooze } = useCoach();
  const [filter, setFilter] = useState<Filter>('needs');
  const [query, setQuery] = useState('');
  const [actionsFor, setActionsFor] = useState<DemoClient | null>(null);

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
    const items = markHandled(c.id);
    setActionsFor(null);
    toast({ message: `${c.name.split(' ')[0]} marked handled`, actionLabel: 'Undo', onAction: () => restore(items) });
  };

  const snoozeFor = (c: DemoClient, days: number, label: string) => {
    const until = new Date();
    until.setDate(until.getDate() + days);
    until.setHours(7, 0, 0, 0);
    snooze(c.id, until);
    setActionsFor(null);
    toast({ message: `${c.name.split(' ')[0]} snoozed until ${label.toLowerCase()}` });
  };

  const needCount = rows.length;

  return (
    <Screen scroll={false}>
      <ScreenHeader title="Clients" subtitle={needCount ? `${needCount} need you today` : 'Nobody needs you right now'} />
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
      {clients.length === 0 ? (
        <EmptyState message="No clients yet. Send your first invite and they’ll show up here." />
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
            return (
              <ListRow
                left={<Monogram initials={initials(item.client.name)} size={40} />}
                title={item.client.name}
                reason={t ? reasonText(t.top) : undefined}
                subtitle={`${more}${item.client.status === 'paused' ? 'Paused · ' : ''}${item.client.plan}`}
                onPress={() => router.push(`/client/${item.client.id}`)}
                right={<IconButton icon="more-horizontal" label={`Actions for ${item.client.name}`} onPress={() => setActionsFor(item.client)} />}
                last={index === list.length - 1}
              />
            );
          }}
        />
      )}

      <Sheet visible={!!actionsFor} title={actionsFor?.name ?? ''} onClose={() => setActionsFor(null)}>
        {actionsFor ? (
          <>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: margin, paddingBottom: space[3] },
  chips: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[3] },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space[4], minHeight: 40, justifyContent: 'center' },
});
