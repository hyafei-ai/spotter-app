import { DEMO_CLIENTS } from '@spotter/core/demo';
import { DEMO_TENANTS } from '@spotter/core';

/*
 * MOCK DATA for the web dashboard's Team and Data pages: the same fictional team as the coach app
 * demo (src/platform/team.ts there). Connected builds read memberships and coach_assignments.
 */
export const demoTenant = DEMO_TENANTS['maya-reyes-strength']!;

export interface WebCoach {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'assistant';
  split: number;
  status: 'active' | 'invited';
}

export const demoCoaches: WebCoach[] = [
  { id: 'owner', name: demoTenant.coach.name, email: demoTenant.supportEmail, role: 'owner', split: 1, status: 'active' },
  { id: 'leo', name: 'Leo Park', email: 'leo@mayareyes.example', role: 'assistant', split: 0.6, status: 'active' },
];

export const demoClients = DEMO_CLIENTS.map((c, i) => ({ id: c.id, name: c.name, plan: c.plan, coachId: i % 3 === 2 ? 'leo' : 'owner' }));

export function download(name: string, content: string | Uint8Array, type: string) {
  const part: BlobPart = typeof content === 'string' ? content : (content.slice().buffer as ArrayBuffer);
  const url = URL.createObjectURL(new Blob([part], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
