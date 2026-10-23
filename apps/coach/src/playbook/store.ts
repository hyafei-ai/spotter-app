import { create } from 'zustand';
import { pinPattern, uuidv7, type Pattern, type PlaybookEntry } from '@spotter/core';
import { tenant } from '../env';

/*
 * The coach's playbook per client (docs/features/patterns.md, PlaybookEntry): patterns pinned as worth
 * acting on, patterns dismissed as not useful, and the coach's own notes. Coach-only; the client never sees it.
 * MOCK transport: kept on this device (localStorage on web, memory on native).
 * TODO-INTEGRATE: a `playbook_entries` table (tenant_id, client_id, coach_id, pattern_id, text, source,
 * pinned_at, dismissed) under the same RLS as coach notes.
 */
const KEY = `spotter.playbook.${tenant.slug}`;

interface ClientPlaybook {
  entries: PlaybookEntry[];
  dismissed: string[];
}
type Doc = Record<string, ClientPlaybook>;

function read(): Doc {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as Doc) : null;
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}
function write(d: Doc) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(d));
  } catch {
    // private mode: in memory only
  }
}

interface PlaybookState {
  doc: Doc;
  pin(clientId: string, p: Pattern): PlaybookEntry;
  addNote(clientId: string, text: string): void;
  remove(clientId: string, entryId: string): void;
  dismiss(clientId: string, patternId: string): void;
  restore(clientId: string, patternId: string): void;
}

const EMPTY: ClientPlaybook = { entries: [], dismissed: [] };

export const usePlaybook = create<PlaybookState>((set, get) => {
  const update = (clientId: string, f: (p: ClientPlaybook) => ClientPlaybook) => {
    const doc = { ...get().doc, [clientId]: f(get().doc[clientId] ?? EMPTY) };
    set({ doc });
    write(doc);
  };
  return {
    doc: read(),
    pin(clientId, p) {
      const e = pinPattern(p, uuidv7(), new Date().toISOString());
      update(clientId, (c) => ({
        ...c,
        entries: [e, ...c.entries.filter((x) => x.patternId !== p.id)],
      }));
      return e;
    },
    addNote(clientId, text) {
      const e: PlaybookEntry = {
        id: uuidv7(),
        patternId: null,
        text,
        pinnedAt: new Date().toISOString(),
        source: 'coach',
      };
      update(clientId, (c) => ({ ...c, entries: [e, ...c.entries] }));
    },
    remove(clientId, entryId) {
      update(clientId, (c) => ({ ...c, entries: c.entries.filter((x) => x.id !== entryId) }));
    },
    dismiss(clientId, patternId) {
      update(clientId, (c) => ({ ...c, dismissed: [...new Set([...c.dismissed, patternId])] }));
    },
    restore(clientId, patternId) {
      update(clientId, (c) => ({ ...c, dismissed: c.dismissed.filter((x) => x !== patternId) }));
    },
  };
});

export const playbookFor = (doc: Doc, clientId: string): ClientPlaybook => doc[clientId] ?? EMPTY;
