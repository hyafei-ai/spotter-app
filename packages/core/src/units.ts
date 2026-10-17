export type WeightUnit = 'kg' | 'lb';

const LB_PER_KG = 2.2046226218;

/** Weights are stored in kg on the server; the tenant unit is only for display and entry. */
export function toDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

export function fromDisplay(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG;
}

/** Rounds to the nearest loadable increment (e.g. 2.5 kg or 5 lb). */
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  const rounded = Math.round(value / increment) * increment;
  // Avoid 102.49999999 style float noise.
  return Math.round(rounded * 1000) / 1000;
}

export function formatNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const [int, dec] = String(Math.abs(rounded)).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '-' : ''}${grouped}${dec ? `.${dec}` : ''}`;
}

/**
 * Display a weight stored in kg. Pass an increment only for prescribed loads shown in another unit
 * (80 kg → 175 lb); logged results are always shown as logged, never rounded to a plate increment.
 */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit, increment = 0): string {
  if (kg == null) return '—';
  const shown = increment > 0 ? roundToIncrement(toDisplay(kg, unit), increment) : toDisplay(kg, unit);
  return `${formatNumber(shown)} ${unit}`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return sec ? `${m}:${String(sec).padStart(2, '0')}` : `${m} min`;
  return `${sec} s`;
}

export function formatRestClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
