import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { encodeQr, qrPath } from '@spotter/core';

/**
 * Invite QR code. Always dark on white with a 4-module quiet zone, whatever the theme:
 * phone cameras scan inverted (light-on-dark) codes unreliably.
 */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const q = useMemo(() => encodeQr(value, 'M'), [value]);
  const dim = q.size + 8;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} accessibilityRole="image" accessibilityLabel={label}>
      <Rect x={0} y={0} width={dim} height={dim} fill="#FFFFFF" />
      <Path d={qrPath(q)} fill="#000000" />
    </Svg>
  );
}
