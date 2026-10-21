import { create } from 'zustand';
import {
  buildCheckInSummaryInput,
  buildProgramDraftInput,
  capMessage,
  mockCheckInSummary,
  mockProgramDraft,
  programFromAiDraft,
  toDraftProgram,
  usageState,
  uuidv7,
  type CheckInSummaryInput,
  type DraftProgram,
} from '@spotter/core';
import { demoLibrary, demoProgramSource, demoSummarySource } from './demoSource';
import { usePrograms } from '../programs';

/**
 * Coach-side AI drafts (K-2). Every output is a draft until the coach taps Approve and send.
 * Live builds call the Edge Functions (EXPO_PUBLIC_SUPABASE_URL set); demo builds use the MOCK
 * deterministic stand-ins in packages/core/src/ai.ts, built only from the sample data.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const AI_LIVE = !!SUPABASE_URL;
/** MOCK monthly cap for the demo. Live builds enforce AI_MONTHLY_DRAFT_CAP server-side. */
export const DEMO_MONTHLY_CAP = 20;

/** Set by the auth feature once sign-in exists; until then live calls go out unauthenticated and fail clearly. */
let tokenGetter: () => string | null = () => null;
const getAccessToken = () => tokenGetter();
export function setAccessTokenGetter(fn: () => string | null) {
  tokenGetter = fn;
}

export type SummaryState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'nothing'; message: string }
  | { status: 'failed'; message: string }
  | { status: 'cap'; message: string }
  | { status: 'draft'; draftId: string; original: string; text: string; basedOn: BasedOn; createdAt: string }
  | { status: 'sending'; draftId: string; original: string; text: string; basedOn: BasedOn; createdAt: string }
  | { status: 'sent'; draftId: string; text: string; edited: boolean; sentAt: string; basedOn: BasedOn };

export interface BasedOn {
  sessionsDone: number;
  sessionsPlanned: number;
  sets: number;
  checkInSubmitted: boolean;
  photosSubmitted: boolean;
  records: number;
}

export type ProgramState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'failed'; message: string }
  | { status: 'cap'; message: string }
  | { status: 'no_intake' }
  | { status: 'ready'; program: DraftProgram; saved: boolean; programId?: string };

export interface SentMessage {
  id: string;
  clientId: string;
  body: string;
  at: string;
}

interface AiState {
  summaries: Record<string, SummaryState>;
  programs: Record<string, ProgramState>;
  sent: SentMessage[];
  /** Drafts generated this month (demo counter). */
  used: number;
  /** Demo control: make the next generation fail, to show the failed state and Retry. */
  simulateFailure: boolean;
  setSimulateFailure(v: boolean): void;
  generateSummary(clientId: string): Promise<void>;
  editSummary(clientId: string, text: string): void;
  approveAndSend(clientId: string): Promise<void>;
  discardSummary(clientId: string): void;
  draftProgram(clientId: string, weeks: number): Promise<void>;
  saveProgramDraft(clientId: string): void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function basedOn(input: CheckInSummaryInput): BasedOn {
  return {
    sessionsDone: input.adherence.done,
    sessionsPlanned: input.adherence.planned,
    sets: input.exercises.reduce((n, e) => n + e.sets, 0),
    checkInSubmitted: !!input.checkIn?.submitted,
    photosSubmitted: !!input.checkIn?.photosSubmitted,
    records: input.records.length,
  };
}

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${getAccessToken() ?? ''}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Couldn’t reach the server. Check your connection and try again.'), { code: 'offline' });
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Something went wrong drafting this. Try again.'), { code: data.code });
  return data;
}

/** MOCK: where the demo keeps saved program drafts for the program builder to open. */

export const useAi = create<AiState>((set, get) => {
  const setSummary = (clientId: string, s: SummaryState) => set({ summaries: { ...get().summaries, [clientId]: s } });
  const setProgram = (clientId: string, s: ProgramState) => set({ programs: { ...get().programs, [clientId]: s } });

  return {
    summaries: {},
    programs: {},
    sent: [],
    used: 0,
    simulateFailure: false,
    setSimulateFailure: (v) => set({ simulateFailure: v }),

    async generateSummary(clientId) {
      setSummary(clientId, { status: 'generating' });
      try {
        if (AI_LIVE) {
          const res = await callFunction<{
            draft: { id: string; output: { text: string }; created_at: string };
            basedOn: Omit<BasedOn, 'photosSubmitted' | 'records'>;
          }>('ai-check-in-summary', { clientId });
          setSummary(clientId, {
            status: 'draft',
            draftId: res.draft.id,
            original: res.draft.output.text,
            text: res.draft.output.text,
            basedOn: { ...res.basedOn, photosSubmitted: false, records: 0 },
            createdAt: res.draft.created_at,
          });
          return;
        }
        // MOCK path
        await delay(700);
        if (get().simulateFailure) throw new Error('The AI service didn’t respond. Try again.');
        const cap = usageState(get().used, DEMO_MONTHLY_CAP);
        if (!cap.allowed) return setSummary(clientId, { status: 'cap', message: capMessage(cap) });
        const src = demoSummarySource(clientId);
        if (!src || src.sessions.length === 0) {
          return setSummary(clientId, { status: 'nothing', message: 'Nothing was logged this week, so there’s nothing to summarise yet.' });
        }
        const input = buildCheckInSummaryInput(src);
        const text = mockCheckInSummary(input).lines.join('\n');
        set({ used: get().used + 1 });
        setSummary(clientId, { status: 'draft', draftId: uuidv7(), original: text, text, basedOn: basedOn(input), createdAt: new Date().toISOString() });
      } catch (err) {
        const e = err as Error & { code?: string };
        if (e.code === 'cap_reached') return setSummary(clientId, { status: 'cap', message: e.message });
        setSummary(clientId, { status: 'failed', message: e.message });
      }
    },

    editSummary(clientId, text) {
      const s = get().summaries[clientId];
      if (s?.status === 'draft') setSummary(clientId, { ...s, text });
    },

    async approveAndSend(clientId) {
      const s = get().summaries[clientId];
      if (s?.status !== 'draft' || !s.text.trim()) return;
      setSummary(clientId, { ...s, status: 'sending' });
      try {
        if (AI_LIVE) {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/approve_ai_draft`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${getAccessToken() ?? ''}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
            },
            body: JSON.stringify({ draft_id: s.draftId, final_text: s.text, send: true }),
          });
          if (!res.ok) throw new Error('Couldn’t send it. Your draft is still here; try again.');
        } else {
          await delay(400);
        }
        const at = new Date().toISOString();
        set({ sent: [...get().sent, { id: uuidv7(), clientId, body: s.text.trim(), at }] });
        setSummary(clientId, { status: 'sent', draftId: s.draftId, text: s.text.trim(), edited: s.text.trim() !== s.original.trim(), sentAt: at, basedOn: s.basedOn });
      } catch (err) {
        setSummary(clientId, { ...s, status: 'draft' });
        throw err;
      }
    },

    discardSummary(clientId) {
      setSummary(clientId, { status: 'idle' });
    },

    async draftProgram(clientId, weeks) {
      setProgram(clientId, { status: 'generating' });
      try {
        if (AI_LIVE) {
          const res = await callFunction<{ program: DraftProgram }>('ai-program-draft', { clientId, weeks });
          const programId = usePrograms.getState().importProgram(programFromAiDraft(res.program));
          return setProgram(clientId, { status: 'ready', program: res.program, saved: true, programId });
        }
        // MOCK path
        await delay(900);
        if (get().simulateFailure) throw new Error('The AI service didn’t respond. Try again.');
        const cap = usageState(get().used, DEMO_MONTHLY_CAP);
        if (!cap.allowed) return setProgram(clientId, { status: 'cap', message: capMessage(cap) });
        const src = demoProgramSource(clientId, weeks);
        if (!src) return setProgram(clientId, { status: 'no_intake' });
        const out = mockProgramDraft(buildProgramDraftInput(src));
        set({ used: get().used + 1 });
        setProgram(clientId, { status: 'ready', program: toDraftProgram(out, demoLibrary(), () => uuidv7()), saved: false });
      } catch (err) {
        const e = err as Error & { code?: string };
        if (e.code === 'cap_reached') return setProgram(clientId, { status: 'cap', message: e.message });
        if (e.code === 'no_intake') return setProgram(clientId, { status: 'no_intake' });
        setProgram(clientId, { status: 'failed', message: e.message });
      }
    },

    saveProgramDraft(clientId) {
      const p = get().programs[clientId];
      if (p?.status !== 'ready') return;
      // Lands in the program builder as an unpublished draft (source 'ai_draft'); MOCK storage in the demo.
      const programId = usePrograms.getState().importProgram(programFromAiDraft(p.program));
      setProgram(clientId, { ...p, saved: true, programId });
    },
  };
});

export function useSentMessages(clientId: string): SentMessage[] {
  return useAi((s) => s.sent).filter((m) => m.clientId === clientId);
}
