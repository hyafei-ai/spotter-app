import { NO_STATUS, type WatchNative } from './types';

/** No Apple Watch on the web preview or Android: the watch preview screen shows the redesign instead. */
export const watchNative: WatchNative = {
  available: false,
  status: async () => NO_STATUS,
  updateContext: async () => {},
  startOnWatch: async () => false,
  drain: async () => [],
  onInbound: () => () => {},
  onStatus: () => () => {},
  onHeartRate: () => () => {},
};
