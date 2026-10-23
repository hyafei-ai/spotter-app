import { useMemo, useState } from 'react';
import { Image, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { shareCardFor } from '@spotter/core';
import { Button, EmptyState, IconButton, Screen, SectionLabel, StrikeUnder, Text, buildColors, palette, useTheme, useToast, fonts, margin, radius, space } from '@spotter/ui';
import { tenant } from '../src/env';
import { shortDate } from '../src/format';
import { useWins, type Win } from '../src/wins/useWins';
import { cardImage } from '../src/wins/cardImage';

/**
 * Share a win (docs/ux/first-value.md, the word-of-mouth loop): the client picks a win and shares a card in
 * the trainer's brand ("… · Coached by Maya Reyes"). The client chooses what goes on it; wins built from watch
 * data are only on a card when the client picks them, and the screen says so.
 *
 * Native: the share sheet with the card's text (no image library is installed). Web: the card drawn to a PNG
 * to download, the system share when the browser has one, else Copy text.
 */
export default function ShareWin() {
  const { colors } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const wins = useWins();
  const initial = wins.find((w) => w.id === id) ?? wins.find((w) => !w.health) ?? wins[0];
  const [picked, setPicked] = useState<string | undefined>(initial?.id);
  const win = wins.find((w) => w.id === picked) ?? initial;
  const card = useMemo(() => (win ? shareCardFor(win, tenant.coach.name, tenant.appName) : null), [win]);
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/train'));
  // The card always uses the light paper, so the image looks the same whoever opens it.
  const card$ = buildColors('light', tenant.brandColor);

  if (!win || !card) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={back} />
        </View>
        <EmptyState message="No wins to share yet. Keep logging: more reps at a weight counts." actionLabel="Back to Train" onAction={back} />
      </Screen>
    );
  }

  const style = { brand: card$.brand, brandInk: card$.brandInk, paper: palette.light.paper, ink: palette.light.ink, ink2: palette.light.ink2, appName: tenant.appName, monogram: tenant.coach.monogram };

  const share = async () => {
    setBusy(true);
    try {
      if (Platform.OS !== 'web') {
        await Share.share({ message: card.text });
        return;
      }
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) {
        await nav.share({ text: card.text });
        return;
      }
      await Clipboard.setStringAsync(card.text);
      toast({ message: 'Copied. Paste it wherever you post.' });
    } catch {
      // The person closed the share sheet: nothing to do.
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const url = await cardImage(card, style);
    if (!url || typeof document === 'undefined') {
      toast({ message: 'Couldn’t make the image here. Copy the text instead.' });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tenant.slug}-win.png`;
    a.click();
  };

  return (
    <Screen
      footer={
        <View style={{ gap: space[1] }}>
          <Button label="Share" icon="share" loading={busy} onPress={() => void share()} />
          {Platform.OS === 'web' ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button label="Download image" kind="quiet" onPress={() => void download()} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Copy text" kind="quiet" onPress={() => void Clipboard.setStringAsync(card.text).then(() => toast({ message: 'Copied.' }))} />
              </View>
            </View>
          ) : null}
        </View>
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Share a win
        </Text>
        <Text color="ink2">{`A card in ${tenant.appName}’s colours. You choose the win; nothing else goes on it.`}</Text>
      </View>

      <View style={styles.cardWrap}>
        <View
          style={[styles.card, { backgroundColor: palette.light.paper, borderColor: palette.light.line }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Share card: ${card.headline}. ${card.coachedBy}. ${tenant.appName}.`}
        >
          <View style={[styles.band, { backgroundColor: card$.brand }]} />
          <View style={styles.brandRow}>
            {tenant.logoUrl ? (
              <Image source={{ uri: tenant.logoUrl }} style={styles.logo} accessibilityIgnoresInvertColors />
            ) : (
              <View style={[styles.mono, { backgroundColor: card$.brand }]}>
                <Text style={{ fontFamily: fonts.title, fontSize: 18, lineHeight: 22, color: card$.brandInk }} allowFontScaling={false}>
                  {tenant.coach.monogram}
                </Text>
              </View>
            )}
            <Text variant="bodyStrong" style={{ color: palette.light.ink }}>
              {tenant.appName}
            </Text>
          </View>
          <View>
            <Text style={[styles.headline, { color: palette.light.ink }]}>{card.headline}</Text>
            <View style={{ width: '45%', height: 10, marginTop: 2 }}>
              <StrikeUnder />
            </View>
          </View>
          <Text variant="callout" style={{ color: palette.light.ink2 }}>
            {card.coachedBy}
          </Text>
        </View>
      </View>

      {win.health ? (
        <View style={styles.notice}>
          <Feather name="info" size={16} color={colors.ink2} />
          <Text variant="callout" color="ink2" style={{ flex: 1 }}>
            {win.kind === 'phase_best' ? 'This win mentions your cycle phase.' : 'This win comes from your watch data.'} It’s on the card only because you picked it.
          </Text>
        </View>
      ) : null}

      {wins.length > 1 ? (
        <>
          <SectionLabel>Pick a win</SectionLabel>
          <View accessibilityRole="radiogroup">
            {wins.map((w) => (
              <WinOption key={w.id} w={w} selected={w.id === win.id} onPress={() => setPicked(w.id)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function WinOption({ w, selected, onPress }: { w: Win; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      aria-checked={selected}
      accessibilityLabel={`${w.text}${w.health ? ', includes health data' : ''}`}
      style={({ pressed }) => [styles.option, { borderBottomColor: colors.line, backgroundColor: pressed ? colors.surface : 'transparent' }]}
    >
      <Feather name={selected ? 'check-circle' : 'circle'} size={22} color={selected ? colors.brand : colors.ink2} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{w.text}</Text>
        <Text variant="caption" color="ink2">
          {`${shortDate(w.date)}${w.health ? (w.kind === 'phase_best' ? ' · mentions your cycle' : ' · from your watch') : ''}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1], paddingBottom: space[3] },
  cardWrap: { paddingHorizontal: margin },
  card: { borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth * 2, padding: space[5], paddingTop: space[6], gap: space[6], overflow: 'hidden', aspectRatio: 4 / 5, justifyContent: 'space-between' },
  band: { position: 'absolute', left: 0, right: 0, top: 0, height: 6 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  mono: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 36, height: 36, borderRadius: 6 },
  headline: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44 },
  notice: { flexDirection: 'row', gap: space[2], paddingHorizontal: margin, paddingTop: space[3], alignItems: 'flex-start' },
  row: { flexDirection: 'row', gap: space[2] },
  option: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
});
