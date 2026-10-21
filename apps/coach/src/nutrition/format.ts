import { PORTION_LABEL, formatNumber, type NutritionTargets, type PortionKey, type Portions } from '@spotter/core';

export function targetsLine(t: NutritionTargets): string {
  if (!t.macros) return 'No targets yet';
  const m = t.macros;
  return `${formatNumber(m.kcal)} kcal · P ${formatNumber(m.proteinG)} g · C ${formatNumber(m.carbsG)} g · F ${formatNumber(m.fatG)} g`;
}

export function portionsLine(p: Portions, keys: PortionKey[]): string {
  return keys.map((k) => `${formatNumber(p[k])} ${p[k] === 1 ? PORTION_LABEL[k].unit : PORTION_LABEL[k].units}`).join(' · ');
}
