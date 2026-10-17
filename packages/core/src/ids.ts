/**
 * UUIDv7 (RFC 9562), generated on device so rows created offline keep their IDs after sync.
 * Requires globalThis.crypto.getRandomValues; the apps polyfill it from expo-crypto.
 */
declare const crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T };

let lastMs = 0;
let seq = 0;

export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Keep IDs monotonic within the same millisecond by bumping a 12-bit counter in rand_a.
  if (now === lastMs) {
    seq = (seq + 1) & 0xfff;
  } else {
    lastMs = now;
    seq = ((bytes[6] ?? 0) << 4) & 0x7ff; // random start, top bit clear to leave room to count up
  }

  let ms = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | ((seq >> 8) & 0x0f);
  bytes[7] = seq & 0xff;
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
