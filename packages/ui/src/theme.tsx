import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { checkBrandColor, deriveDarkBrand, onColor, type TenantConfig } from '@spotter/core';
import { palette, type Colors } from './tokens';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: Colors;
  tenant: TenantConfig;
}

const ThemeContext = createContext<Theme | null>(null);

/**
 * The tenant's brand is the only colour that changes per app. Light mode uses the AA-checked
 * shade; dark mode derives a lighter variant that passes against dark paper.
 */
export function buildColors(scheme: 'light' | 'dark', brandColor: string): Colors {
  const base = palette[scheme];
  const lightBrand = checkBrandColor(brandColor, palette.light.paper).suggestion;
  const brand = scheme === 'light' ? lightBrand : deriveDarkBrand(lightBrand, palette.dark.paper);
  return {
    ...base,
    brand,
    brandInk: onColor(brand, '#FFFFFF', palette.light.ink),
    strike: brand,
    scrim: scheme === 'light' ? 'rgba(28,27,24,0.4)' : 'rgba(0,0,0,0.6)',
  };
}

export function ThemeProvider({
  tenant,
  scheme: forced,
  children,
}: {
  tenant: TenantConfig;
  scheme?: 'light' | 'dark';
  children: ReactNode;
}) {
  const system = useColorScheme();
  const scheme = forced ?? (system === 'dark' ? 'dark' : 'light');
  const value = useMemo<Theme>(
    () => ({ scheme, colors: buildColors(scheme, tenant.brandColor), tenant }),
    [scheme, tenant],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside <ThemeProvider>');
  return t;
}
