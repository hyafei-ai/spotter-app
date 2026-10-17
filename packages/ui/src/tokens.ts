/** Design tokens from the requirements doc (Design system). Do not add colours here without updating the doc. */

export const palette = {
  light: {
    paper: '#F3EFE7',
    surface: '#FBF9F4',
    ink: '#1C1B18',
    ink2: '#5D5A52',
    line: '#DDD6C8',
    brand: '#C2410C',
    success: '#2F6B3F',
    warning: '#9A6A00',
    error: '#B3261E',
  },
  dark: {
    paper: '#171614',
    surface: '#211F1C',
    ink: '#F1ECE2',
    ink2: '#A8A296',
    line: '#34312C',
    brand: '#F07A3E',
    success: '#6FBF83',
    warning: '#E0B04A',
    error: '#F2867E',
  },
} as const;

export type ColorName = keyof (typeof palette)['light'];
export type Colors = Record<ColorName, string> & { brandInk: string; strike: string; scrim: string };

export const fonts = {
  display: 'BarlowCondensed_700Bold',
  title: 'BarlowCondensed_600SemiBold',
  regular: 'SourceSans3_400Regular',
  semibold: 'SourceSans3_600SemiBold',
} as const;

export const type = {
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44 },
  title: { fontFamily: fonts.title, fontSize: 28, lineHeight: 32 },
  headline: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  callout: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  /** Condensed numerals in table cells (weight, reps). */
  figure: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
} as const;

export type TypeVariant = keyof typeof type;

/** 4-pt scale. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const margin = 20;
export const rowMin = 56;
export const touchMin = 48; // satisfies 44 pt iOS and 48 dp Android

export const radius = { control: 6, sheet: 10 } as const;

export const motion = { standard: 180, strike: 260 } as const;
