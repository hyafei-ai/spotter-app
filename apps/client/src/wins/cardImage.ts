import type { ShareCard } from '@spotter/core';
import type { CardStyle } from './cardImage.web';

export type { CardStyle };

/**
 * Native: no image yet. react-native-view-shot isn't installed, and this build doesn't add a native
 * dependency for it; the share sheet carries the card's text instead (docs/ux/client-experience.md).
 */
export async function cardImage(_card: ShareCard, _s: CardStyle): Promise<string | null> {
  return null;
}
