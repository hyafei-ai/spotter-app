import { useHealthImports } from '../health/store';

/**
 * Periods already logged in Apple Health / Health Connect, so the athlete doesn't enter them twice.
 * Read-only: nothing is ever written back to the health app. The health import reads them only after
 * cycle tracking is on (src/health/store.ts asks for that permission separately).
 */
export async function readHealthPeriods(): Promise<{ start: string; end: string | null }[]> {
  return useHealthImports.getState().periods;
}
