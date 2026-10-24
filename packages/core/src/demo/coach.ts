/*
 * MOCK DATA — the demo coach's client list and triage items for Maya Reyes Strength.
 * Names, plans and reasons are invented for the preview build.
 */
import type { TriageItem } from '../triage';

export interface DemoClient {
  id: string;
  name: string;
  plan: string;
  startDate: string;
  status: 'active' | 'paused' | 'new';
  flags: ('injury' | 'parq' | 'payment')[];
  thisWeek: { planned: number; done: number };
  lastSession: string | null;
  injuryNote?: string;
}

const id = (n: number) => `0192f0a2-0000-7000-8000-${String(n).padStart(12, '0')}`;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const DEMO_CLIENTS: DemoClient[] = [
  { id: id(1), name: 'Jordan Ellis', plan: 'Online coaching · monthly', startDate: '2026-08-04', status: 'active', flags: [], thisWeek: { planned: 3, done: 2 }, lastSession: 'Lower A · 7 days ago' },
  { id: id(2), name: 'Priya Natarajan', plan: 'Online coaching · monthly', startDate: '2026-06-17', status: 'active', flags: ['payment'], thisWeek: { planned: 4, done: 3 }, lastSession: 'Upper B · yesterday' },
  { id: id(3), name: 'Tomás Herrera-Vidal', plan: 'Hybrid · 8 sessions', startDate: '2026-10-13', status: 'new', flags: ['parq'], thisWeek: { planned: 2, done: 0 }, lastSession: null },
  { id: id(4), name: 'Aisha Bello', plan: 'Online coaching · monthly', startDate: '2026-03-02', status: 'active', flags: ['injury'], thisWeek: { planned: 3, done: 3 }, lastSession: 'Full Body C · today', injuryNote: 'Left shoulder: no overhead pressing until cleared.' },
  { id: id(5), name: 'Chris Lindqvist', plan: 'Online coaching · monthly', startDate: '2026-05-21', status: 'active', flags: [], thisWeek: { planned: 3, done: 0 }, lastSession: 'Lower B · 9 days ago' },
  { id: id(6), name: 'Mei Tanaka', plan: 'Pay in full · 12 weeks', startDate: '2026-09-01', status: 'active', flags: [], thisWeek: { planned: 4, done: 2 }, lastSession: 'Pull · 2 days ago' },
  { id: id(7), name: 'Daniel O’Sullivan', plan: 'Online coaching · monthly', startDate: '2026-01-12', status: 'paused', flags: [], thisWeek: { planned: 0, done: 0 }, lastSession: 'Upper A · 5 weeks ago' },
  { id: id(8), name: 'Fatima Zahra El Idrissi', plan: 'Online coaching · weekly', startDate: '2026-07-30', status: 'active', flags: [], thisWeek: { planned: 3, done: 2 }, lastSession: 'Lower A · 2 days ago' },
  // Multisport demo clients (demo/multisport.ts): race-format, functional fitness and a masters runner.
  { id: id(9), name: 'Sasha Okafor', plan: 'Hybrid · race prep', startDate: '2026-05-04', status: 'active', flags: [], thisWeek: { planned: 4, done: 3 }, lastSession: 'Threshold kilometres · 2 days ago' },
  { id: id(10), name: 'Ravi Kapoor', plan: 'Online coaching · monthly', startDate: '2026-02-16', status: 'active', flags: [], thisWeek: { planned: 5, done: 4 }, lastSession: 'Fran · yesterday' },
  { id: id(11), name: 'Ruth Adeyemi', plan: 'Run coaching · monthly', startDate: '2025-11-03', status: 'active', flags: [], thisWeek: { planned: 3, done: 2 }, lastSession: 'Easy run · 3 days ago' },
];

export function demoTriage(): TriageItem[] {
  const t = (n: number, clientId: string, reason: TriageItem['reason'], since: string, count?: number): TriageItem => ({
    id: id(100 + n), clientId, reason, since, count, snoozedUntil: null, handledAt: null,
  });
  const c = DEMO_CLIENTS;
  return [
    t(1, c[1]!.id, 'payment_failed', daysAgo(1)),
    t(2, c[2]!.id, 'parq_flag', daysAgo(0.2)),
    t(3, c[2]!.id, 'new_client', daysAgo(4)),
    t(4, c[0]!.id, 'form_check_waiting', daysAgo(1)),
    t(5, c[0]!.id, 'unread_message', daysAgo(0.1), 1),
    t(6, c[5]!.id, 'check_in_submitted', daysAgo(0.5)),
    t(7, c[4]!.id, 'missed_sessions', daysAgo(5), 2),
    t(8, c[4]!.id, 'churn_risk', daysAgo(2)),
    t(9, c[7]!.id, 'unread_message', daysAgo(0.3), 3),
  ];
}
