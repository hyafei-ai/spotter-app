import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Rect, Circle } from 'react-native-svg';
import { rosterCell, rosterRowText, viewerSeesHealth, type RosterCell } from '@spotter/core';
import { isoDay, isSampleClient, type DemoClient } from '@spotter/core/demo';
import { Text, useTheme, margin, space } from '@spotter/ui';
import { useViewerLens } from '../atrisk/AtRiskList';
import { clientDays } from '../today/data';

const DAYS = 14;
const CELL = 14;
const GAP = 3;
const NAME_W = 92;

/**
 * Clients → Grid (docs/ux/coach-experience.md): every client × the last 14 days, so a slow slide shows before
 * it becomes a conversation. A filled square is a day trained; the mark under it is the day's strain tone
 * (rosterCell: amber = one strain signal, brand = two or more). Each row reads as a sentence for screen
 * readers (rosterRowText). Health tones only for clients whose health this viewer sees.
 */
export function RosterGrid({ clients }: { clients: DemoClient[] }) {
  const { colors } = useTheme();
  const lens = useViewerLens();
  const [width, setWidth] = useState(0);
  const today = isoDay(0);
  const rows = useMemo(
    () =>
      clients.map((c) => {
        const sees =
          isSampleClient(c.id) ||
          viewerSeesHealth(
            lens.viewerId,
            { coachId: lens.coachOf[c.id] ?? null },
            { solo: lens.solo },
          );
        const days = clientDays(c.id, DAYS);
        const cells: RosterCell[] = days.map((d) => {
          const cell = rosterCell(d);
          return sees ? cell : { trained: cell.trained, tone: null, flags: [] };
        });
        const first = c.name.split(' ')[0]!;
        const text = days.length
          ? sees
            ? rosterRowText(first, days, today)
            : `${first}: trained ${cells.filter((x) => x.trained).length} of ${days.length} days. Health signals stay with their coach.`
          : `${first}: not connected yet.`;
        const empty = !days.some(
          (d) =>
            d.training.sessions.length > 0 ||
            d.recovery.sleepHours != null ||
            d.recovery.hrvMs != null ||
            d.nutrition.kcal != null ||
            d.check != null,
        );
        return { c, cells, text: empty ? `${first}: nothing shared yet.` : text, empty };
      }),
    [clients, lens.viewerId, lens.coachOf, lens.solo, today],
  );

  const gridW = DAYS * (CELL + GAP);
  const cellW = width ? Math.min(CELL + GAP, (width - NAME_W) / DAYS) : CELL + GAP;
  const cw = cellW - GAP;
  const dayLetters = Array.from({ length: DAYS }, (_, i) =>
    new Date(Date.parse(`${today}T12:00:00Z`) - (DAYS - 1 - i) * 86_400_000).toLocaleDateString(
      'en-US',
      { weekday: 'narrow', timeZone: 'UTC' },
    ),
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space[8] }}>
      <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View
          style={styles.headRow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="caption" color="ink2" style={{ width: NAME_W }}>
            Last 14 days
          </Text>
          <View style={{ flexDirection: 'row', width: Math.min(gridW, DAYS * cellW) }}>
            {dayLetters.map((l, i) => (
              <Text
                key={i}
                variant="caption"
                color={i === DAYS - 1 ? 'ink' : 'ink2'}
                style={{ width: cellW, textAlign: 'center', fontSize: 11 }}
              >
                {l}
              </Text>
            ))}
          </View>
        </View>
        {rows.map(({ c, cells, text, empty }) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`${text} Opens ${c.name.split(' ')[0]}’s page.`}
            onPress={() => router.push(`/client/${c.id}`)}
            style={({ pressed }) => [
              styles.row,
              {
                borderBottomColor: colors.line,
                backgroundColor: pressed ? colors.surface : 'transparent',
              },
            ]}
          >
            <Text
              variant="bodyStrong"
              numberOfLines={1}
              style={{ width: NAME_W, paddingRight: space[2] }}
            >
              {c.name.split(' ')[0]}
              {c.name.split(' ')[1] ? ` ${c.name.split(' ')[1]![0]}.` : ''}
            </Text>
            {empty ? (
              <Text variant="caption" color="ink2">
                Nothing shared yet
              </Text>
            ) : (
              <Svg
                width={DAYS * cellW}
                height={CELL + 8}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {cells.map((cell, i) => {
                  const x = i * cellW + GAP / 2;
                  return (
                    <Rect
                      key={i}
                      x={x + 0.5}
                      y={0.5}
                      width={cw - 1}
                      height={CELL - 1}
                      rx={3}
                      fill={cell.trained ? colors.ink : 'transparent'}
                      stroke={cell.trained ? colors.ink : colors.line}
                      strokeWidth={1}
                    />
                  );
                })}
                {cells.map((cell, i) =>
                  cell.tone === 'ease' || cell.tone === 'watch' ? (
                    <Circle
                      key={`t${i}`}
                      cx={i * cellW + GAP / 2 + cw / 2}
                      cy={CELL + 4.5}
                      r={cell.tone === 'ease' ? 3 : 2.5}
                      fill={cell.tone === 'ease' ? colors.brand : colors.warning}
                    />
                  ) : null,
                )}
              </Svg>
            )}
          </Pressable>
        ))}
        <View style={styles.legend}>
          <Legend
            swatch={<View style={[styles.sq, { backgroundColor: colors.ink }]} />}
            label="Trained"
          />
          <Legend
            swatch={<View style={[styles.sq, { borderColor: colors.line, borderWidth: 1 }]} />}
            label="No training"
          />
          <Legend
            swatch={<View style={[styles.dot, { backgroundColor: colors.warning }]} />}
            label="One strain signal"
          />
          <Legend
            swatch={
              <View style={[styles.dot, { backgroundColor: colors.brand, width: 7, height: 7 }]} />
            }
            label="Two or more: ease off"
          />
        </View>
        <Text variant="caption" color="ink2">
          Strain signals: short sleep, HRV well under their usual, resting HR up, pain at 4/10 or
          more, under-fuelled, or a rough daily check. Tap a row to see why.
        </Text>
      </View>
    </ScrollView>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text variant="caption" color="ink2">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: margin, gap: 0 },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: space[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
    paddingTop: space[3],
    paddingBottom: space[2],
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  sq: { width: 12, height: 12, borderRadius: 3 },
  dot: { width: 6, height: 6, borderRadius: 4 },
});
