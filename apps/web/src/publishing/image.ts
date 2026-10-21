'use client';

import type { ImageMeta } from '@spotter/core';

/** Reads a file's size, type and whether any pixel is transparent, entirely in the browser. */
export async function inspectImage(file: File): Promise<{ meta: ImageMeta; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Couldn’t read that file.'));
    r.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml') return { meta: { type: file.type, width: 0, height: 0, bytes: file.size }, dataUrl };
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('That file isn’t an image we can open.'));
    i.src = dataUrl;
  });
  let hasAlpha = false;
  if (file.type === 'image/png') {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i]! < 255) {
          hasAlpha = true;
          break;
        }
      }
    }
  }
  return { meta: { type: file.type, width: img.naturalWidth, height: img.naturalHeight, hasAlpha, bytes: file.size }, dataUrl };
}

/** A small preview copy so the demo can keep it in local storage. */
export async function thumbnail(dataUrl: string, size = 192): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, size / Math.max(img.naturalWidth || size, img.naturalHeight || size));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((img.naturalWidth || size) * scale);
  canvas.height = Math.round((img.naturalHeight || size) * scale);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export async function sha256Fingerprint(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `sha256:${Array.from(d.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
