import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { FuelLevel } from '@spotter/core';
import {
  DEFAULT_FUEL_SETTINGS,
  DEMO_CLIENT,
  DEMO_FUEL_BODYWEIGHT_KG,
  DEMO_FUEL_SETTINGS,
  EMPTY_FUEL_SHARES,
  coachClientIdFor,
  fuelKey,
  type FuelSettings,
  type FuelSharesDoc,
} from '@spotter/core/demo';
import { readShared, writeShared } from '@spotter/ui';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { IS_DEMO, tenant } from '../env';

/**
 * The fuel check's settings and what was last shared (docs/features/fuel.md). Private by default:
 * nothing reaches the coach unless "Share fuel check level" is on, and then only the level and the
 * signs' text. Offline first: settings and shares are queued as fuel.settings.set / fuel.pattern.share.
 */

export interface SharedFuel {
  date: string;
  level: FuelLevel;
  signs: string[];
}

interface FuelState {
  hydrated: boolean;
  settings: FuelSettings;
  /** Kept on the phone only; used for fat-free mass and exercise estimates. */
  bodyweightKg: number | null;
  lastShared: SharedFuel | null;
  setSettings(patch: Partial<FuelSettings>): Promise<void>;
  setBodyweight(kg: number | null): void;
  /** Shares today's level when sharing is on and it changed since the last share. */
  publish(p: SharedFuel): Promise<void>;
  reset(): void;
}

// MOCK: the demo athlete weighs about 62 kg and has already chosen "Use an estimate".
const START_SETTINGS = IS_DEMO ? DEMO_FUEL_SETTINGS : DEFAULT_FUEL_SETTINGS;
const START_BODYWEIGHT = IS_DEMO ? DEMO_FUEL_BODYWEIGHT_KG : null;

const myCoachSideId = () => coachClientIdFor(DEMO_CLIENT.id);

/** MOCK transport to the demo coach app: the shared entry, or null when kept private. */
async function writeDemoShare(entry: FuelSharesDoc[string]) {
  const doc = await readShared<FuelSharesDoc>(fuelKey(tenant.slug), EMPTY_FUEL_SHARES);
  await writeShared(fuelKey(tenant.slug), { ...doc, [myCoachSideId()]: entry });
}

const same = (a: SharedFuel | null, b: SharedFuel) => !!a && a.date === b.date && a.level === b.level && a.signs.join('|') === b.signs.join('|');

export const useFuel = create<FuelState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      settings: START_SETTINGS,
      bodyweightKg: START_BODYWEIGHT,
      lastShared: null,

      async setSettings(patch) {
        const settings = { ...get().settings, ...patch };
        const stopSharing = get().settings.shareWithCoach && !settings.shareWithCoach;
        set({ settings, ...(stopSharing ? { lastShared: null } : {}) });
        await syncQueue.enqueue('fuel.settings.set', { ...settings, updatedAt: new Date().toISOString() });
        void syncQueue.flush();
        if (IS_DEMO && stopSharing) await writeDemoShare(null);
      },

      setBodyweight: (kg) => set({ bodyweightKg: kg != null && kg > 20 && kg < 300 ? Math.round(kg * 10) / 10 : null }),

      async publish(p) {
        if (!get().settings.shareWithCoach || same(get().lastShared, p)) return;
        set({ lastShared: p });
        const sharedAt = new Date().toISOString();
        await syncQueue.enqueue('fuel.pattern.share', { date: p.date, level: p.level, signs: p.signs.slice(0, 6), sharedAt });
        void syncQueue.flush();
        if (IS_DEMO) await writeDemoShare({ ...p, sharedAt });
      },

      reset: () => set({ settings: START_SETTINGS, bodyweightKg: START_BODYWEIGHT, lastShared: null }),
    }),
    {
      // Not spotter.fuel.<tenant>: that key is the demo coach transport.
      name: `spotter.fuelcheck.${tenant.slug}`,
      storage: createJSONStorage(() => kv),
      partialize: ({ settings, bodyweightKg, lastShared }) => ({ settings, bodyweightKg, lastShared }),
      onRehydrateStorage: () => () => useFuel.setState({ hydrated: true }),
    },
  ),
);
