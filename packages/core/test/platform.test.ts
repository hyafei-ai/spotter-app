import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  buildInviteUrl,
  deliveryDecision,
  inQuietHours,
  parseCsv,
  parseInvite,
  revenueSplitProblem,
  splitAmount,
  toCsv,
  validateClientImport,
  validateProgramImport,
  CLIENT_IMPORT_TEMPLATE,
  type NotificationSettings,
} from '../src/platform';
import { Mutation } from '../src/schemas';
import { uuidv7 } from '../src/ids';

describe('invites', () => {
  it('round-trips through a link and through router params', () => {
    const url = buildInviteUrl('https://mayareyes.spotter.app/', { token: 'tok_12345678', tenant: 'maya-reyes-strength', email: 'jo+gym@example.com', role: 'client' });
    expect(url).toBe('https://mayareyes.spotter.app/join?t=tok_12345678&tenant=maya-reyes-strength&e=jo%2Bgym%40example.com');
    expect(parseInvite(url)).toEqual({ token: 'tok_12345678', tenant: 'maya-reyes-strength', email: 'jo+gym@example.com', role: 'client' });
    expect(parseInvite({ t: 'tok_12345678', tenant: 'maya-reyes-strength', r: 'assistant' })?.role).toBe('assistant');
  });

  it('rejects incomplete or malformed invites', () => {
    expect(parseInvite('https://x.app/join?tenant=maya-reyes-strength')).toBeNull();
    expect(parseInvite({ t: 'short', tenant: 'maya-reyes-strength' })).toBeNull();
    expect(parseInvite({ t: 'tok_12345678', tenant: 'Bad Slug!' })).toBeNull();
    expect(parseInvite('https://x.app/join?t=%E0%A4%A&tenant=ok-slug')).toBeNull();
  });
});

describe('notifications', () => {
  const s: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, timezone: 'Europe/London' };

  it('handles quiet hours that wrap past midnight, in the user’s own time zone', () => {
    expect(inQuietHours(s, new Date('2026-10-21T22:30:00Z'))).toBe(true); // 23:30 BST
    expect(inQuietHours(s, new Date('2026-10-21T05:30:00Z'))).toBe(true); // 06:30 BST
    expect(inQuietHours(s, new Date('2026-10-21T06:30:00Z'))).toBe(false); // 07:30 BST
    expect(inQuietHours({ ...s, quietStart: 13 * 60, quietEnd: 14 * 60 }, new Date('2026-10-21T12:15:00Z'))).toBe(true);
    expect(inQuietHours({ ...s, quietStart: null }, new Date('2026-10-21T22:30:00Z'))).toBe(false);
  });

  it('holds during quiet hours, skips when turned off, and never holds the rest timer', () => {
    const night = new Date('2026-10-21T23:30:00Z');
    expect(deliveryDecision(s, 'coach_reply', night)).toBe('hold');
    expect(deliveryDecision(s, 'rest_timer', night)).toBe('send');
    expect(deliveryDecision({ ...s, enabled: { ...s.enabled, triage: false } }, 'triage', new Date('2026-10-21T12:00:00Z'))).toBe('skip');
  });
});

describe('CSV', () => {
  it('quotes, escapes and defuses spreadsheet formulas', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: '=SUM(A1)' }])).toBe('a,b,c\r\n"x,y","say ""hi""",\'=SUM(A1)\r\n');
  });

  it('parses quoted fields, embedded commas, newlines and doubled quotes, and round-trips toCsv', () => {
    const csv = '﻿name,notes\r\n"Ruiz, Ana","said ""hi""\nthen left"\r\n\r\nBo,\n';
    expect(parseCsv(csv)).toEqual([
      { name: 'Ruiz, Ana', notes: 'said "hi"\nthen left' },
      { name: 'Bo', notes: '' },
    ]);
    const rows = [{ a: 'x,y', b: 'say "hi"' }];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('validates client rows and reports problems by spreadsheet row', () => {
    const { valid, issues } = validateClientImport(
      [
        { Name: 'Ana Ruiz', Email: 'ANA@example.com', 'Start date': '2026-11-02' },
        { Name: '', Email: 'nope' },
        { Name: 'Dup', Email: 'ana@example.com' },
        { Name: 'Existing', Email: 'jordan@example.com', start_date: '02/11/2026' },
      ],
      ['jordan@example.com'],
    );
    expect(valid).toEqual([{ name: 'Ana Ruiz', email: 'ana@example.com', plan: null, startDate: '2026-11-02', coachEmail: null, notes: null }]);
    expect(issues.map((i) => `${i.row}:${i.column}`)).toEqual(['3:name', '3:email', '4:email', '5:email', '5:start_date']);
  });

  it('the downloadable template validates cleanly', () => {
    const [header, row] = CLIENT_IMPORT_TEMPLATE.trim().split('\r\n');
    const cols = header!.split(',');
    const vals = row!.split(',');
    expect(validateClientImport([Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? '']))]).issues).toEqual([]);
  });

  it('groups program rows into weeks and days', () => {
    const { programs, issues } = validateProgramImport([
      { program: 'Base', week: '1', day: '2', day_title: 'Upper', exercise: 'Bench', sets: '3', reps_min: '6', reps_max: '8', load_kg: '60' },
      { program: 'Base', week: '1', day: '1', day_title: 'Lower', exercise: 'Squat', sets: '3', reps_min: '5', load_kg: '80.5' },
      { program: 'Base', week: '1', day: '9', exercise: 'Row', sets: '3' },
      { program: 'Base', week: '1', day: '1', exercise: 'Lunge', sets: '3', reps_min: '10', reps_max: '8' },
    ]);
    expect(issues.map((i) => `${i.row}:${i.column}`)).toEqual(['4:day', '5:reps_max']);
    expect(programs[0]!.weeks[0]!.days.map((d) => d.title)).toEqual(['Lower', 'Upper']);
    expect(programs[0]!.weeks[0]!.days[0]!.exercises[0]).toMatchObject({ name: 'Squat', repsMin: 5, repsMax: 5, loadKg: 80.5 });
  });
});

describe('team', () => {
  it('validates splits and divides payments without losing a cent', () => {
    expect(revenueSplitProblem(0.6)).toBeNull();
    expect(revenueSplitProblem(1.2)).toMatch(/between 0 and 100/);
    expect(splitAmount(9999, 0.6)).toEqual({ coach: 5999, owner: 4000 });
  });
});

describe('new mutation kinds', () => {
  it('accepts attachments, read receipts and consent', () => {
    const base = { clientMutationId: uuidv7(), createdAt: new Date().toISOString() };
    const ok = (m: unknown) => Mutation.safeParse(m).success;
    expect(ok({ ...base, kind: 'message.attach', payload: { messageId: uuidv7(), threadId: uuidv7(), kind: 'voice', body: null, mediaPath: null, durationMs: 4200, link: null, sentAt: new Date().toISOString() } })).toBe(true);
    expect(ok({ ...base, kind: 'message.read', payload: { threadId: uuidv7(), upTo: new Date().toISOString() } })).toBe(true);
    expect(ok({ ...base, kind: 'consent.record', payload: { consentId: uuidv7(), kind: 'terms_privacy', granted: true, version: '2026-10-01', recordedAt: new Date().toISOString() } })).toBe(true);
  });
});
