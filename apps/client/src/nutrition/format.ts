import { formatNumber, PORTION_LABEL, type PortionKey } from '@spotter/core';

export const g = (n: number) => `${formatNumber(n)} g`;
export const kcal = (n: number) => `${formatNumber(Math.round(n))} kcal`;

export function portionCount(key: PortionKey, n: number): string {
  const l = PORTION_LABEL[key];
  return `${formatNumber(n)} ${n === 1 ? l.unit : l.units}`;
}

/** "1,060 left" / "200 over" / "On target", with the unit. */
export function leftOrOver(value: number, target: number, unit: 'kcal' | 'g'): string {
  const diff = Math.round((target - value) * 10) / 10;
  if (Math.abs(diff) < (unit === 'kcal' ? 1 : 0.5)) return 'On target';
  const n = `${formatNumber(Math.abs(diff))}${unit === 'g' ? ' g' : ' kcal'}`;
  return diff > 0 ? `${n} left` : `${n} over`;
}

export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (date.toDateString() === yest.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

export function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1, d! + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
