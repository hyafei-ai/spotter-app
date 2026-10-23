/**
 * Periods already logged in Apple Health / Health Connect, so the athlete doesn't enter them twice.
 * Read-only: nothing is ever written back to the health app.
 *
 * TODO-INTEGRATE: the brief builder adds `readPeriods(): Promise<{ start, end }[]>` to the health source
 * (src/health/source.*). Swap the body for `return health.readPeriods()` (with the same catch) at merge.
 */
export async function readHealthPeriods(): Promise<{ start: string; end: string | null }[]> {
  return [];
}
