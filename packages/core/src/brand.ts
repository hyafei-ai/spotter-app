/** Brand colour checks for tenant setup (W-1). WCAG 2.x relative luminance and contrast. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const AA_TEXT = 4.5;

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * Walks the colour toward `target` (black or white) in small steps until it passes AA
 * against `background`. Returns the first passing shade, i.e. the nearest one on that path.
 */
export function nearestPassing(color: string, background: string, target: string, ratio = AA_TEXT): string {
  const from = parseHex(color);
  const to = parseHex(target);
  for (let i = 0; i <= 100; i++) {
    const candidate = toHex(mix(from, to, i / 100));
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return toHex(to);
}

export interface BrandCheck {
  ok: boolean;
  ratio: number;
  /** Suggested replacement when the colour fails; equal to the input when it passes. */
  suggestion: string;
}

/** Light mode: brand is used as text/strokes on paper, so it must reach 4.5:1 against paper. */
export function checkBrandColor(color: string, paper: string): BrandCheck {
  const ratio = contrastRatio(color, paper);
  if (ratio >= AA_TEXT) return { ok: true, ratio, suggestion: color.toUpperCase() };
  // Paper is light, so darkening is the only direction that raises contrast.
  return { ok: false, ratio, suggestion: nearestPassing(color, paper, '#000000') };
}

/** Dark mode variant: lighten toward white until it passes against the dark paper. */
export function deriveDarkBrand(color: string, darkPaper: string): string {
  return nearestPassing(color, darkPaper, '#FFFFFF');
}

/** Text colour to put on a brand fill (button label). */
export function onColor(fill: string, light = '#FFFFFF', dark = '#1C1B18'): string {
  return contrastRatio(fill, light) >= contrastRatio(fill, dark) ? light : dark;
}
