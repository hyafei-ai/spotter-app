/**
 * Watch colours baked into the asset catalog at build time. A plain-JS copy of the phone's dark-mode rule
 * (packages/core/src/brand.ts + watch.ts `watchBranding`): the tenant brand, made AA on paper, then lightened
 * until it passes 4.5:1 on the watch background. packages/core/test/watch.test.ts checks the two agree for
 * every demo tenant, so they can't drift.
 */
const PAPER = '#F3EFE7';
const WATCH_BACKGROUND = '#171614';
const INK = '#1C1B18';

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
const channel = (v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
function luminance(hex) {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function nearestPassing(color, background, target, ratio = 4.5) {
  const from = parseHex(color);
  const to = parseHex(target);
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const candidate = toHex({ r: from.r + (to.r - from.r) * t, g: from.g + (to.g - from.g) * t, b: from.b + (to.b - from.b) * t });
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return toHex(to);
}

/** { accent, accentInk } for the watch, from the tenant's brand colour. */
function watchAccent(brandColor) {
  const light = contrastRatio(brandColor, PAPER) >= 4.5 ? String(brandColor).toUpperCase() : nearestPassing(brandColor, PAPER, '#000000');
  const accent = nearestPassing(light, WATCH_BACKGROUND, '#FFFFFF');
  const accentInk = contrastRatio(accent, '#FFFFFF') >= contrastRatio(accent, INK) ? '#FFFFFF' : INK;
  return { accent, accentInk };
}

/** "#F07A3E" → asset-catalog colour components (sRGB, 0–1, three decimals). */
function colorComponents(hex) {
  const { r, g, b } = parseHex(hex);
  const f = (v) => (v / 255).toFixed(3);
  return { red: f(r), green: f(g), blue: f(b), alpha: '1.000' };
}

module.exports = { watchAccent, colorComponents, WATCH_BACKGROUND };
