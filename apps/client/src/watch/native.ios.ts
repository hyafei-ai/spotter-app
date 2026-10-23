import { NativeEventEmitter, NativeModules } from 'react-native';
import { NO_STATUS, type WatchNative, type WatchStatus } from './types';
import { watchNative as none } from './native.web';

/**
 * The `SpotterWatch` native module (apps/client/plugins/watch/SpotterWatchModule.m), present only in iOS
 * builds made with SPOTTER_WATCH=1. Not verified on a device here: no iOS toolchain in this environment.
 */
interface Module {
  status(): Promise<WatchStatus>;
  updateContext(json: string): Promise<boolean>;
  startOnWatch(planId: string, activityType: number): Promise<boolean>;
  drain(): Promise<string[]>;
}

const mod = (NativeModules as { SpotterWatch?: Module }).SpotterWatch;

function make(m: Module): WatchNative {
  const events = new NativeEventEmitter(m as never);
  const on = (name: string, cb: (x: never) => void) => {
    // The emitter's listener type is untyped (Object[]); our events carry the shapes documented in types.ts.
    const sub = events.addListener(name, cb as (...args: unknown[]) => void);
    return () => sub.remove();
  };
  return {
    available: true,
    status: async () => {
      try {
        return await m.status();
      } catch {
        return NO_STATUS;
      }
    },
    updateContext: async (json) => {
      await m.updateContext(json);
    },
    startOnWatch: (planId, activityType) => m.startOnWatch(planId, activityType).catch(() => false),
    drain: () => m.drain().catch(() => []),
    onInbound: (cb) => on('inbound', cb),
    onStatus: (cb) => on('status', cb),
    onHeartRate: (cb) => on('heartRate', (e: { bpm: number }) => cb(e.bpm)),
  };
}

export const watchNative: WatchNative = mod ? make(mod) : none;
