import { create } from 'zustand';
import { DEFAULT_INTAKE_FORM, IntakeForm, finalizeForm, formProblems } from '@spotter/core';
import { tenant } from './env';

/*
 * The coach's intake form. Real builds read and write the tenant's default `intake_forms` row
 * (owner-only under RLS). MOCK: the demo keeps it in localStorage on the web preview, which the
 * client app on the same origin reads; on native it lives in memory for the session.
 */
const KEY = `spotter.intakeForm.${tenant.slug}`;
const ls = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);

function read(): IntakeForm {
  try {
    const raw = ls()?.getItem(KEY);
    const parsed = raw ? IntakeForm.safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) return parsed.data;
  } catch {
    // fall through to the starter form
  }
  return DEFAULT_INTAKE_FORM;
}

interface EditorState {
  saved: IntakeForm;
  draft: IntakeForm;
  dirty: boolean;
  edit(next: IntakeForm): void;
  save(): IntakeForm | null;
  discard(): void;
  resetToStarter(): void;
}

export const useIntakeEditor = create<EditorState>((set, get) => {
  const initial = read();
  return {
    saved: initial,
    draft: initial,
    dirty: false,
    edit: (draft) => set({ draft, dirty: true }),
    save() {
      const { draft, saved } = get();
      if (formProblems(draft).length) return null;
      const next = finalizeForm(draft, saved.version);
      ls()?.setItem(KEY, JSON.stringify(next));
      set({ saved: next, draft: next, dirty: false });
      return next;
    },
    discard: () => set({ draft: get().saved, dirty: false }),
    resetToStarter: () => set({ draft: { ...DEFAULT_INTAKE_FORM, version: get().saved.version }, dirty: true }),
  };
});
