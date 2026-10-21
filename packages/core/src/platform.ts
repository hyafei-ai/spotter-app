import { z } from 'zod';

/*
 * Platform helpers shared by both apps, the web dashboard and the Edge Functions:
 * invite links (C-1), notification preferences (push), CSV import/export (K-9),
 * team revenue splits (K-8) and consent records (GDPR).
 */

/* ---------- invites (C-1) ---------- */

export const InviteParams = z.object({
  token: z.string().min(8).max(64),
  tenant: z.string().regex(/^[a-z0-9-]{3,40}$/),
  email: z.string().email().optional(),
  role: z.enum(['client', 'assistant']).default('client'),
});
export type InviteParams = z.infer<typeof InviteParams>;

/**
 * Link the invite email and QR code carry. The app opens it via its scheme or universal link.
 * Built by hand rather than with URL: React Native's URL implementation lacks searchParams.
 */
export function buildInviteUrl(base: string, p: InviteParams): string {
  const q: [string, string][] = [
    ['t', p.token],
    ['tenant', p.tenant],
  ];
  if (p.email) q.push(['e', p.email]);
  if (p.role !== 'client') q.push(['r', p.role]);
  return `${base.replace(/\/+$/, '')}/join?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

function queryOf(url: string): Record<string, string> {
  const i = url.indexOf('?');
  if (i < 0) return {};
  const out: Record<string, string> = {};
  for (const pair of url.slice(i + 1).split('#')[0]!.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try {
      out[decodeURIComponent(k!)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      // malformed escape: skip the pair
    }
  }
  return out;
}

/** Reads invite params from a URL or from router search params. Returns null when they're missing or malformed. */
export function parseInvite(input: string | Record<string, string | string[] | undefined>): InviteParams | null {
  const src: Record<string, string | string[] | undefined> = typeof input === 'string' ? queryOf(input) : input;
  const get = (k: string) => {
    const v = src[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const parsed = InviteParams.safeParse({ token: get('t'), tenant: get('tenant'), email: get('e') || undefined, role: get('r') ?? 'client' });
  return parsed.success ? parsed.data : null;
}

/* ---------- notifications ---------- */

export const NotificationCategory = z.enum(['coach_reply', 'client_message', 'rest_timer', 'check_in_due', 'form_check_reply', 'triage', 'program_ready', 'payment']);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

export const NotificationSettings = z.object({
  enabled: z.record(NotificationCategory, z.boolean()),
  /** Minutes after local midnight; quiet hours may wrap past midnight. Null = no quiet hours. */
  quietStart: z.number().int().min(0).max(1439).nullable(),
  quietEnd: z.number().int().min(0).max(1439).nullable(),
  timezone: z.string().min(1),
});
export type NotificationSettings = z.infer<typeof NotificationSettings>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: {
    coach_reply: true,
    client_message: true,
    rest_timer: true,
    check_in_due: true,
    form_check_reply: true,
    triage: true,
    program_ready: true,
    payment: true,
  },
  quietStart: 22 * 60,
  quietEnd: 7 * 60,
  timezone: 'UTC',
};

/** Rest-timer alerts are local and the user is mid-workout, so quiet hours don't apply to them. */
const IGNORES_QUIET_HOURS: NotificationCategory[] = ['rest_timer'];

export function minutesInZone(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

export function inQuietHours(s: NotificationSettings, now: Date): boolean {
  if (s.quietStart == null || s.quietEnd == null || s.quietStart === s.quietEnd) return false;
  const m = minutesInZone(now, s.timezone);
  return s.quietStart < s.quietEnd ? m >= s.quietStart && m < s.quietEnd : m >= s.quietStart || m < s.quietEnd;
}

/** Whether to push now, hold until quiet hours end, or not send at all. */
export function deliveryDecision(s: NotificationSettings, category: NotificationCategory, now: Date): 'send' | 'hold' | 'skip' {
  if (s.enabled[category] === false) return 'skip';
  if (!IGNORES_QUIET_HOURS.includes(category) && inQuietHours(s, now)) return 'hold';
  return 'send';
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/* ---------- CSV (K-9) ---------- */

export type CsvRow = Record<string, string>;

/** RFC 4180 CSV with a header row. Formula-like cells are prefixed so spreadsheets don't execute them. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown): string => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/** Parses CSV with a header row (RFC 4180: quoted fields, doubled quotes, CRLF or LF). Blank lines are skipped. */
export function parseCsv(text: string): CsvRow[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    records.push(row);
  }
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''));
  const [header, ...body] = nonEmpty;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, j) => [h.trim(), r[j] ?? ''])));
}

export const CLIENT_IMPORT_COLUMNS = ['name', 'email', 'plan', 'start_date', 'coach_email', 'notes'] as const;
export const CLIENT_IMPORT_TEMPLATE = toCsv(
  // MOCK: example rows in the downloadable template; clearly fictional.
  [
    { name: 'Alex Example', email: 'alex@example.com', plan: 'Online coaching · monthly', start_date: '2026-11-02', coach_email: '', notes: 'Prefers mornings' },
  ],
  [...CLIENT_IMPORT_COLUMNS],
);

export interface ImportIssue {
  /** 1-based row number as the coach sees it in a spreadsheet (header is row 1). */
  row: number;
  column: string | null;
  message: string;
}

export interface ClientImportRow {
  name: string;
  email: string;
  plan: string | null;
  startDate: string | null;
  coachEmail: string | null;
  notes: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function norm(row: CsvRow): CsvRow {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, '_'), (v ?? '').trim()]));
}

/** Validates parsed CSV rows. Rows with problems are reported, not dropped silently. */
export function validateClientImport(rows: CsvRow[], existingEmails: string[] = []): { valid: ClientImportRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const valid: ClientImportRow[] = [];
  const seen = new Set(existingEmails.map((e) => e.toLowerCase()));
  if (rows.length === 0) issues.push({ row: 1, column: null, message: 'The file has no client rows.' });
  rows.forEach((raw, i) => {
    const r = norm(raw);
    const row = i + 2;
    const before = issues.length;
    if (!r.name) issues.push({ row, column: 'name', message: 'Name is missing.' });
    if (!r.email) issues.push({ row, column: 'email', message: 'Email is missing.' });
    else if (!EMAIL_RE.test(r.email)) issues.push({ row, column: 'email', message: `“${r.email}” isn’t an email address.` });
    else if (seen.has(r.email.toLowerCase())) issues.push({ row, column: 'email', message: `${r.email} is already a client or appears twice.` });
    if (r.start_date && (!DATE_RE.test(r.start_date) || Number.isNaN(Date.parse(r.start_date))))
      issues.push({ row, column: 'start_date', message: 'Start date must look like 2026-11-02.' });
    if (r.coach_email && !EMAIL_RE.test(r.coach_email)) issues.push({ row, column: 'coach_email', message: 'Coach email isn’t an email address.' });
    if (r.email) seen.add(r.email.toLowerCase());
    if (issues.length === before)
      valid.push({
        name: r.name!,
        email: r.email!.toLowerCase(),
        plan: r.plan || null,
        startDate: r.start_date || null,
        coachEmail: r.coach_email || null,
        notes: r.notes || null,
      });
  });
  return { valid, issues };
}

export const PROGRAM_IMPORT_COLUMNS = ['program', 'week', 'day', 'day_title', 'exercise', 'sets', 'reps_min', 'reps_max', 'load_kg', 'rest_s', 'notes'] as const;
export const PROGRAM_IMPORT_TEMPLATE = toCsv(
  // MOCK: example program rows for the template.
  [
    { program: 'Strength Base', week: 1, day: 1, day_title: 'Lower A', exercise: 'Back Squat', sets: 3, reps_min: 5, reps_max: 8, load_kg: 80, rest_s: 150, notes: '' },
    { program: 'Strength Base', week: 1, day: 1, day_title: 'Lower A', exercise: 'Romanian Deadlift', sets: 3, reps_min: 8, reps_max: 10, load_kg: 70, rest_s: 120, notes: '' },
  ],
  [...PROGRAM_IMPORT_COLUMNS],
);

export interface ImportedProgram {
  name: string;
  weeks: { index: number; days: { index: number; title: string; exercises: { name: string; sets: number; repsMin: number | null; repsMax: number | null; loadKg: number | null; restS: number | null; notes: string | null }[] }[] }[];
}

const int = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
const num = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);

/** Groups program rows into programs → weeks → days → exercises, reporting bad rows. */
export function validateProgramImport(rows: CsvRow[]): { programs: ImportedProgram[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const byName = new Map<string, ImportedProgram>();
  if (rows.length === 0) issues.push({ row: 1, column: null, message: 'The file has no program rows.' });
  rows.forEach((raw, i) => {
    const r = norm(raw);
    const row = i + 2;
    const before = issues.length;
    const week = int(r.week);
    const day = int(r.day);
    const sets = int(r.sets);
    if (!r.program) issues.push({ row, column: 'program', message: 'Program name is missing.' });
    if (!week || week < 1) issues.push({ row, column: 'week', message: 'Week must be a whole number from 1.' });
    if (!day || day < 1 || day > 7) issues.push({ row, column: 'day', message: 'Day must be a whole number from 1 to 7.' });
    if (!r.exercise) issues.push({ row, column: 'exercise', message: 'Exercise is missing.' });
    if (!sets || sets < 1 || sets > 20) issues.push({ row, column: 'sets', message: 'Sets must be between 1 and 20.' });
    const repsMin = int(r.reps_min);
    const repsMax = int(r.reps_max) ?? repsMin;
    if (r.reps_min && repsMin == null) issues.push({ row, column: 'reps_min', message: 'Reps must be a whole number.' });
    if (repsMin != null && repsMax != null && repsMax < repsMin) issues.push({ row, column: 'reps_max', message: 'Top of the rep range is below the bottom.' });
    const loadKg = num(r.load_kg);
    if (r.load_kg && loadKg == null) issues.push({ row, column: 'load_kg', message: 'Load must be a number in kg.' });
    if (issues.length !== before) return;
    const p = byName.get(r.program!) ?? { name: r.program!, weeks: [] };
    byName.set(r.program!, p);
    let w = p.weeks.find((x) => x.index === week);
    if (!w) p.weeks.push((w = { index: week!, days: [] }));
    let d = w.days.find((x) => x.index === day);
    if (!d) w.days.push((d = { index: day!, title: r.day_title || `Day ${day}`, exercises: [] }));
    d.exercises.push({ name: r.exercise!, sets: sets!, repsMin, repsMax, loadKg, restS: int(r.rest_s), notes: r.notes || null });
  });
  const programs = [...byName.values()].map((p) => ({
    ...p,
    weeks: p.weeks.sort((a, b) => a.index - b.index).map((w) => ({ ...w, days: w.days.sort((a, b) => a.index - b.index) })),
  }));
  return { programs, issues };
}

/* ---------- team (K-8) ---------- */

export interface CoachSplit {
  coachId: string;
  /** Share of revenue from this coach's clients that goes to the coach (0–1). */
  split: number;
}

export function revenueSplitProblem(split: number): string | null {
  if (!Number.isFinite(split)) return 'Enter a percentage.';
  if (split < 0 || split > 1) return 'Use a percentage between 0 and 100.';
  return null;
}

/** Owner's and coach's share of a payment in minor units (cents). Rounds in the owner's favour by at most 1. */
export function splitAmount(amountMinor: number, split: number): { coach: number; owner: number } {
  const coach = Math.floor(amountMinor * split);
  return { coach, owner: amountMinor - coach };
}

/* ---------- consent (GDPR / UK GDPR / CCPA) ---------- */

export const CONSENT_VERSION = '2026-10-01';
export const ConsentRecord = z.object({
  consentId: z.string().uuid(),
  kind: z.enum(['terms_privacy', 'marketing', 'health_data']),
  granted: z.boolean(),
  version: z.string(),
  recordedAt: z.string().datetime({ offset: true }),
});
export type ConsentRecord = z.infer<typeof ConsentRecord>;
