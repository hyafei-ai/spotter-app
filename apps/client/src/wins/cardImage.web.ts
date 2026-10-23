import type { ShareCard } from '@spotter/core';

export interface CardStyle {
  brand: string;
  brandInk: string;
  paper: string;
  ink: string;
  ink2: string;
  appName: string;
  monogram: string;
}

/** Wraps text to a width, returning lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Web only: draws the share card to a 1080×1350 PNG with the canvas API (no extra dependency), using the
 * app's loaded fonts. Returns a data URL, or null if the browser can't draw.
 */
export async function cardImage(card: ShareCard, s: CardStyle): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    await document.fonts?.ready;
  } catch {
    // fonts are a nicety; system fonts still draw
  }
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = s.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = s.brand;
  ctx.fillRect(0, 0, W, 24);
  // Monogram and app name.
  ctx.beginPath();
  ctx.arc(130, 170, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = s.brandInk;
  ctx.font = '600 52px BarlowCondensed_600SemiBold, "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.monogram, 130, 172);
  ctx.textAlign = 'left';
  ctx.fillStyle = s.ink;
  ctx.font = '600 44px SourceSans3_600SemiBold, sans-serif';
  ctx.fillText(s.appName, 214, 172);
  // Headline in display type, with the chalk strike under the last line.
  ctx.fillStyle = s.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 112px BarlowCondensed_700Bold, "Arial Narrow", sans-serif';
  const lines = wrap(ctx, card.headline, W - 160).slice(0, 6);
  let y = 470;
  for (const l of lines) {
    ctx.fillText(l, 80, y);
    y += 118;
  }
  const lastW = Math.min(W - 160, ctx.measureText(lines[lines.length - 1] ?? '').width);
  ctx.strokeStyle = s.brand;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const sy = y - 118 + 34;
  ctx.moveTo(86, sy + 6);
  ctx.bezierCurveTo(86 + lastW * 0.3, sy - 4, 86 + lastW * 0.6, sy + 8, 86 + lastW, sy - 2);
  ctx.stroke();
  // Footer.
  ctx.fillStyle = s.ink2;
  ctx.font = '400 40px SourceSans3_400Regular, sans-serif';
  ctx.fillText(card.coachedBy, 80, H - 120);
  return c.toDataURL('image/png');
}
