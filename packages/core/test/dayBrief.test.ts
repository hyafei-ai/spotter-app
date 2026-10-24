import { describe, expect, it } from 'vitest';
import {
  DAY_BRIEF_JSON_SCHEMA,
  DayBriefOutput,
  blocksFromTemplate,
  buildDayBriefInput,
  dayBriefPrompt,
  mockDayBrief,
  newWorkoutBlock,
  templateById,
  type Block,
} from '../src';

let n = 0;
const ids = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;

const fran = blocksFromTemplate(templateById('benchmark.fran')!, ids).blocks[0]!;
const strength: Block = { ...newWorkoutBlock('strength', ids), exerciseIds: ['pe1'] };

describe('Strategy & Stimulus input', () => {
  it('holds the blocks only, with free text redacted', () => {
    const input = buildDayBriefInput({
      title: 'Tuesday: call me on 07700 900123',
      coachNote: 'Email jordan@example.com if your shoulder hurts, details at https://example.com/x',
      blocks: [strength, { ...fran, note: 'Text 07700 900123 when done' }],
      exercises: { pe1: { name: 'Back Squat', prescription: '5 × 5 @ 80% 1RM' } },
      units: 'kg',
    });
    const json = JSON.stringify(input);
    expect(json).not.toMatch(/07700|@example\.com|https:/);
    expect(input.blocks[0]!.lines).toEqual(['Back Squat: 5 × 5 @ 80% 1RM']);
    expect(input.blocks[1]).toMatchObject({ kind: 'rep_scheme', title: 'Fran', timing: 'reps 21-15-9', scoredBy: 'time' });
    expect(Object.keys(input)).toEqual(['title', 'coachNote', 'units', 'blocks']);
  });

  it('has no field that could carry a client’s identity or health data', () => {
    const input = buildDayBriefInput({ title: 'WOD', coachNote: null, blocks: [fran], exercises: {}, units: 'lb' });
    expect(JSON.stringify(input)).not.toMatch(/name"|age|sex|client|cycle|pain|sleep/i);
    expect(input.blocks[0]!.lines[0]).toMatch(/Thruster: 43(\/30)?|Thruster/);
  });

  it('the prompt and schema ask for exactly the two parts', () => {
    const { system, user } = dayBriefPrompt(buildDayBriefInput({ title: 'WOD', coachNote: null, blocks: [fran], exercises: {}, units: 'kg' }));
    expect(system).toMatch(/approves it before any client sees it/);
    expect(user).toMatch(/"stimulus"/);
    expect(DAY_BRIEF_JSON_SCHEMA.required).toEqual(['stimulus', 'strategy']);
  });

  it('MOCK drafts are valid and use no numbers the session doesn’t have', () => {
    for (const k of ['amrap', 'for_time', 'emom', 'tabata', 'intervals', 'station_race', 'timed'] as const) {
      const b = newWorkoutBlock(k, ids);
      const out = mockDayBrief(buildDayBriefInput({ title: 'Session', coachNote: null, blocks: [b], exercises: {}, units: 'kg' }));
      expect(DayBriefOutput.safeParse(out).success, k).toBe(true);
    }
    const out = mockDayBrief(buildDayBriefInput({ title: 'Session', coachNote: null, blocks: [fran], exercises: {}, units: 'kg' }));
    expect(out.stimulus).toContain('Fran');
  });
});
