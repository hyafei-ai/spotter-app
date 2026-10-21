import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { MEAL_LABEL, Meal, macrosFor, type Food } from '@spotter/core';
import { SAMPLE_FOODS } from '@spotter/core/demo';
import { Button, IconButton, Screen, Text, TextField, haptic, useTheme, useToast, margin, radius, space } from '@spotter/ui';
import { IS_DEMO } from '../../src/env';
import { AmountSheet } from '../../src/nutrition/AmountSheet';
import { lookupBarcode, type BarcodeResult } from '../../src/nutrition/foodSearch';
import { useNutritionSetup } from '../../src/nutrition/setup';
import { localDate, mealForNow, useNutrition } from '../../src/nutrition/store';
import { g, kcal } from '../../src/nutrition/format';

/**
 * C-8 barcode scan. From the nutrition screen a product is logged in three taps:
 * "Scan barcode" → (scan) → "Log 1 serving".
 */
export default function Scan() {
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const date = params.date ?? localDate();
  const meal = Meal.safeParse(params.meal).data ?? mealForNow();
  const { colors } = useTheme();
  const toast = useToast();
  const setup = useNutritionSetup();
  const logFood = useNutrition((s) => s.logFood);
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<BarcodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [amountFor, setAmountFor] = useState<Food | null>(null);
  const locked = useRef(false);
  const camera = Platform.OS !== 'web';

  const lookup = async (code: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const r = await lookupBarcode(code);
    setResult(r);
    setBusy(false);
    if (r.kind === 'found') haptic.success();
    else haptic.warning();
  };

  const again = () => {
    setResult(null);
    setTyped('');
    locked.current = false;
  };

  const finish = (food: Food, grams: number) => {
    void logFood(food, grams, meal, date).then(() => {
      toast({ message: `Logged ${food.name}, ${g(grams)}` });
      if (router.canGoBack()) router.back();
      else router.replace('/nutrition');
    });
  };

  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/nutrition'))} />;

  const manual = (
    <View style={styles.manual}>
      <TextField label="Type the barcode" value={typed} onChangeText={(t) => setTyped(t.replace(/[^\d ]/g, ''))} keyboardType="number-pad" inputMode="numeric" placeholder="The numbers under the bars" />
      <Button label="Look it up" kind="secondary" disabled={typed.replace(/\D/g, '').length < 8} disabledReason="Barcodes have 8, 12 or 13 digits." onPress={() => void lookup(typed)} />
    </View>
  );

  const resultView = result ? (
    <View style={styles.result} accessibilityLiveRegion="polite">
      {result.kind === 'found' ? (
        <>
          <Text variant="label" color="ink2">
            Found
          </Text>
          <Text variant="headline">{result.food.name}</Text>
          <Text color="ink2">
            {[result.food.brand, setup?.targets.mode === 'macros' ? `${kcal(macrosFor(result.food, result.food.servingG ?? 100).kcal)} per ${result.food.servingG ? 'serving' : '100 g'}` : null].filter(Boolean).join(' · ')}
          </Text>
          <Button
            label={result.food.servingG ? `Log 1 serving · ${g(result.food.servingG)}` : 'Log 100 g'}
            icon="check"
            onPress={() => {
              haptic.success();
              finish(result.food, result.food.servingG ?? 100);
            }}
          />
          <Button label="Choose amount" kind="secondary" onPress={() => setAmountFor(result.food)} />
          <Button label="Scan something else" kind="quiet" onPress={again} />
        </>
      ) : (
        <>
          <Text variant="headline">
            {result.kind === 'not_found'
              ? 'We couldn’t find that product'
              : result.kind === 'invalid'
                ? 'That barcode didn’t read cleanly'
                : result.kind === 'offline'
                  ? 'No signal for barcode lookups'
                  : 'Barcode lookup isn’t responding'}
          </Text>
          <Text color="ink2">
            {result.kind === 'not_found'
              ? `Nothing in Open Food Facts or USDA for ${result.code}. Add it from the label instead.`
              : result.kind === 'invalid'
                ? 'Hold the phone steady with the whole barcode in view, or type the numbers.'
                : result.kind === 'offline'
                  ? 'Add it from the label now; it syncs when you’re back online.'
                  : 'Add it from the label for now, or try again in a minute.'}
          </Text>
          {result.kind !== 'invalid' ? (
            <Button
              label="Add from the label"
              onPress={() => router.replace({ pathname: '/nutrition/add', params: { date, meal, quick: '1', barcode: 'code' in result ? result.code : '' } })}
            />
          ) : null}
          <Button label="Try again" kind="secondary" onPress={again} />
        </>
      )}
    </View>
  ) : null;

  let body: React.ReactNode;
  if (!camera) {
    body = (
      <>
        <Text color="ink2" style={styles.body}>
          Scanning works in the iPhone and Android app. Here, type the numbers under the barcode.
        </Text>
        {resultView ?? manual}
        {IS_DEMO && !result ? <DemoCodes onPick={(c) => void lookup(c)} /> : null}
      </>
    );
  } else if (!permission) {
    body = <ActivityIndicator style={{ padding: margin }} />;
  } else if (!permission.granted) {
    body = (
      <View style={[styles.body, { gap: space[4] }]}>
        <Text>
          {permission.canAskAgain
            ? 'Spotter uses the camera to read barcodes. Nothing is recorded or saved.'
            : 'Camera access is off for this app. Turn it on in Settings to scan, or type the barcode instead.'}
        </Text>
        {permission.canAskAgain ? (
          <Button label="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          <Button label="Open Settings" kind="secondary" onPress={() => void Linking.openSettings()} />
        )}
        {resultView ?? manual}
      </View>
    );
  } else {
    body = (
      <>
        {resultView ?? (
          <View style={[styles.viewfinder, { borderColor: colors.line }]}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={busy || result ? undefined : (e: BarcodeScanningResult) => void lookup(e.data)}
              accessibilityLabel="Camera viewfinder. Point it at a barcode."
            />
            {busy ? (
              <View style={[StyleSheet.absoluteFill, styles.busy, { backgroundColor: colors.scrim }]}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
          </View>
        )}
        {!result ? manual : null}
      </>
    );
  }

  return (
    <Screen>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Scan barcode
        </Text>
        <Text color="ink2">{`Adding to ${MEAL_LABEL[meal].toLowerCase()}`}</Text>
      </View>
      {body}
      <AmountSheet
        food={amountFor}
        mode={setup?.targets.mode ?? 'macros'}
        onClose={() => setAmountFor(null)}
        onLog={(grams) => {
          const f = amountFor!;
          setAmountFor(null);
          haptic.success();
          finish(f, grams);
        }}
      />
    </Screen>
  );
}

/** MOCK: the demo's sample foods carry made-up barcodes; these let the web preview exercise the flow. */
function DemoCodes({ onPick }: { onPick: (code: string) => void }) {
  const coded = SAMPLE_FOODS.filter((f) => f.barcode).slice(0, 3);
  return (
    <View style={styles.body}>
      <Text variant="label" color="ink2">
        Demo barcodes
      </Text>
      <View style={{ gap: space[2], marginTop: space[2] }}>
        {coded.map((f) => (
          <Button key={f.id} label={`${f.barcode} · ${f.name}`} kind="quiet" full={false} onPress={() => onPick(f.barcode!)} />
        ))}
        <Button label="2000000000992 · not in the database" kind="quiet" full={false} onPress={() => onPick('2000000000992')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1], paddingBottom: space[3] },
  body: { paddingHorizontal: margin, paddingTop: space[2] },
  manual: { paddingHorizontal: margin, paddingTop: space[4], gap: space[3] },
  result: { paddingHorizontal: margin, paddingTop: space[2], gap: space[3] },
  viewfinder: { marginHorizontal: margin, height: 260, borderRadius: radius.sheet, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  busy: { alignItems: 'center', justifyContent: 'center' },
});
