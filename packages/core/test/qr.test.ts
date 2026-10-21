import { describe, expect, it } from 'vitest';
import { encodeQr, qrPath } from '../src/qr';
import fixtures from './qr-fixtures.json';

/*
 * Fixtures are this encoder's own output, each checked by rendering it to an image and decoding it
 * with zxing-cpp (an independent decoder) back to the same text. They guard against regressions.
 * The same check passed for versions 1–27 at all four ECC levels, including multi-byte UTF-8.
 */
describe('encodeQr', () => {
  it.each(fixtures.map((f) => [f.text.slice(0, 40), f] as const))('matches decoder-verified output: %s', (_label, f) => {
    const q = encodeQr(f.text, 'M');
    expect([q.version, q.mask]).toEqual([f.version, f.mask]);
    expect(q.modules.map((r) => r.map((b) => (b ? '1' : '0')).join(''))).toEqual(f.rows);
  });

  it('grows the version with the text and keeps the symbol square', () => {
    const small = encodeQr('https://spotter.app/i/abc');
    const big = encodeQr('x'.repeat(300));
    expect(big.version).toBeGreaterThan(small.version);
    expect(big.size).toBe(big.version * 4 + 17);
    expect(big.modules.every((r) => r.length === big.size)).toBe(true);
  });

  it('refuses text that cannot fit', () => {
    expect(() => encodeQr('x'.repeat(3000), 'H')).toThrow('Text too long');
  });

  it('renders an SVG path with a quiet zone', () => {
    expect(qrPath(encodeQr('A'))).toMatch(/^M4 4h1v1h-1z/);
  });
});
