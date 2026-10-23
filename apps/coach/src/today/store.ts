import { create } from 'zustand';
import { isoDay } from '@spotter/core/demo';

/*
 * What the coach has already done from Today, for today only (so a sent item moves to "Done today" and
 * doesn't ask again). Kept on this phone; tomorrow starts clean. Connected builds may later sync this
 * with the check-ins and messages it stands for; the check-in itself is already recorded on the server.
 */
const KEY = 'spotter.coach.todayDone';

interface Saved {
  day: string;
  done: Record<string, string>;
}

function read(): Saved {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    if (s && s.day === isoDay(0) && s.done && typeof s.done === 'object') return s;
  } catch {
    // fall through
  }
  return { day: isoDay(0), done: {} };
}

function write(s: Saved) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode: in memory only
  }
}

interface TodayDoneState extends Saved {
  /** Marks an item done today, with what happened ("Sent the easier version", "Check-in logged"). */
  markDone(key: string, what: string): void;
  undo(key: string): void;
}

export const useTodayDone = create<TodayDoneState>((set, get) => ({
  ...read(),
  markDone(key, what) {
    const day = isoDay(0);
    const done = { ...(get().day === day ? get().done : {}), [key]: what };
    set({ day, done });
    write({ day, done });
  },
  undo(key) {
    const done = { ...get().done };
    delete done[key];
    set({ done });
    write({ day: get().day, done });
  },
}));

export const todayKey = {
  act: (clientId: string) => `act:${clientId}`,
  checkIn: (clientId: string) => `checkin:${clientId}`,
  win: (clientId: string) => `win:${clientId}`,
};
