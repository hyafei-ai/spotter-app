import { z } from 'zod';
import { ExerciseMetric } from './schemas';

/**
 * Exercise library (K-4): Spotter's built-in starter set plus each coach's own exercises.
 * Built-ins carry names, metrics, tags and equipment only — no demo videos (coaches add their own).
 */

export const LibraryExercise = z.object({
  id: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)?$/),
  name: z.string().trim().min(1).max(80),
  metric: ExerciseMetric,
  tags: z.array(z.string()),
  equipment: z.array(z.string()),
  isCustom: z.boolean(),
  /** File name or storage path of the coach's demo video, once uploaded. */
  demoVideo: z.string().nullable(),
});
export type LibraryExercise = z.infer<typeof LibraryExercise>;

type Seed = [id: string, name: string, metric: ExerciseMetric, tags: string[], equipment: string[]];

const SEED: Seed[] = [
  ['back-squat', 'Back Squat', 'weight_reps', ['legs', 'squat'], ['barbell', 'rack']],
  ['front-squat', 'Front Squat', 'weight_reps', ['legs', 'squat'], ['barbell', 'rack']],
  ['safety-bar-squat', 'Safety Bar Squat', 'weight_reps', ['legs', 'squat'], ['safety bar', 'rack']],
  ['goblet-squat', 'Goblet Squat', 'weight_reps', ['legs', 'squat'], ['dumbbell']],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'weight_reps', ['legs', 'single leg'], ['dumbbell', 'bench']],
  ['walking-lunge', 'Walking Lunge', 'weight_reps', ['legs', 'single leg'], ['dumbbell']],
  ['leg-press', 'Leg Press', 'weight_reps', ['legs'], ['machine']],
  ['deadlift', 'Deadlift', 'weight_reps', ['posterior chain', 'hinge'], ['barbell']],
  ['romanian-deadlift', 'Romanian Deadlift', 'weight_reps', ['posterior chain', 'hinge'], ['barbell']],
  ['db-rdl', 'Dumbbell RDL', 'weight_reps', ['posterior chain', 'hinge'], ['dumbbell']],
  ['hip-thrust', 'Hip Thrust', 'weight_reps', ['posterior chain', 'glutes'], ['barbell', 'bench']],
  ['leg-curl', 'Lying Leg Curl', 'weight_reps', ['legs', 'hamstrings'], ['machine']],
  ['calf-raise', 'Standing Calf Raise', 'weight_reps', ['legs', 'calves'], ['machine']],
  ['bench-press', 'Bench Press', 'weight_reps', ['push', 'chest'], ['barbell', 'bench']],
  ['incline-db-press', 'Incline Dumbbell Press', 'weight_reps', ['push', 'chest'], ['dumbbell', 'bench']],
  ['overhead-press', 'Overhead Press', 'weight_reps', ['push', 'shoulders'], ['barbell']],
  ['db-shoulder-press', 'Seated Dumbbell Press', 'weight_reps', ['push', 'shoulders'], ['dumbbell', 'bench']],
  ['push-up', 'Push-up', 'bodyweight_reps', ['push', 'chest'], ['bodyweight']],
  ['dip', 'Dip', 'bodyweight_reps', ['push', 'triceps'], ['dip bars']],
  ['triceps-pushdown', 'Triceps Pushdown', 'weight_reps', ['push', 'triceps'], ['cable']],
  ['lateral-raise', 'Lateral Raise', 'weight_reps', ['push', 'shoulders'], ['dumbbell']],
  ['pull-up', 'Pull-up', 'bodyweight_reps', ['pull', 'back'], ['pull-up bar']],
  ['chin-up', 'Chin-up', 'bodyweight_reps', ['pull', 'back'], ['pull-up bar']],
  ['lat-pulldown', 'Lat Pulldown', 'weight_reps', ['pull', 'back'], ['cable']],
  ['barbell-row', 'Barbell Row', 'weight_reps', ['pull', 'back'], ['barbell']],
  ['db-row', 'One-arm Dumbbell Row', 'weight_reps', ['pull', 'back'], ['dumbbell', 'bench']],
  ['seated-cable-row', 'Seated Cable Row', 'weight_reps', ['pull', 'back'], ['cable']],
  ['face-pull', 'Face Pull', 'weight_reps', ['pull', 'shoulders'], ['cable']],
  ['biceps-curl', 'Dumbbell Curl', 'weight_reps', ['pull', 'biceps'], ['dumbbell']],
  ['plank', 'Plank', 'time', ['core'], ['bodyweight']],
  ['side-plank', 'Side Plank', 'time', ['core'], ['bodyweight']],
  ['dead-bug', 'Dead Bug', 'bodyweight_reps', ['core'], ['bodyweight']],
  ['hanging-knee-raise', 'Hanging Knee Raise', 'bodyweight_reps', ['core'], ['pull-up bar']],
  ['pallof-press', 'Pallof Press', 'weight_reps', ['core'], ['cable']],
  ['farmer-carry', 'Farmer Carry', 'distance', ['carry', 'grip'], ['dumbbell']],
  ['suitcase-carry', 'Suitcase Carry', 'distance', ['carry', 'core'], ['dumbbell']],
  ['sled-push', 'Sled Push', 'distance', ['conditioning'], ['sled']],
  ['rower', 'Row Erg', 'distance', ['conditioning'], ['rower']],
  ['bike-intervals', 'Bike Intervals', 'time', ['conditioning'], ['bike']],
  ['kettlebell-swing', 'Kettlebell Swing', 'weight_reps', ['posterior chain', 'hinge'], ['kettlebell']],
];

export const STARTER_LIBRARY: LibraryExercise[] = SEED.map(([id, name, metric, tags, equipment]) => ({
  id,
  name,
  metric,
  tags,
  equipment,
  isCustom: false,
  demoVideo: null,
}));

export const libraryTags = (lib: LibraryExercise[]) => [...new Set(lib.flatMap((e) => e.tags))].sort();
export const libraryEquipment = (lib: LibraryExercise[]) => [...new Set(lib.flatMap((e) => e.equipment))].sort();

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

/** Name search (every word must match the start of a word in the name or a tag), then tag/equipment filters. */
export function searchLibrary(lib: LibraryExercise[], query: string, filter: { tag?: string | null; equipment?: string | null } = {}): LibraryExercise[] {
  const words = norm(query).split(/[^a-z0-9]+/).filter(Boolean);
  return lib
    .filter((e) => (!filter.tag || e.tags.includes(filter.tag)) && (!filter.equipment || e.equipment.includes(filter.equipment)))
    .filter((e) => {
      if (words.length === 0) return true;
      const hay = norm(`${e.name} ${e.tags.join(' ')}`).split(/[^a-z0-9]+/);
      return words.every((w) => hay.some((h) => h.startsWith(w)));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function customExerciseId(name: string, tenantSlug: string, taken: Set<string>): string {
  const base = `${tenantSlug}/${norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'exercise'}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/* ---------- bulk demo-video upload: match files to exercises by name ---------- */

const STOP = new Set(['demo', 'video', 'final', 'v1', 'v2', 'v3', 'edit', 'copy', 'clip', 'take', 'mov', 'mp4', 'img', 'the']);

/** "BackSquat_demo-v2.MOV" → ["back", "squat"] */
export function filenameTokens(fileName: string): string[] {
  const base = fileName.replace(/\.[a-z0-9]{2,4}$/i, '');
  return norm(base.replace(/([a-z])([A-Z])/g, '$1 $2'))
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t));
}

const nameTokens = (name: string) => norm(name).split(/[^a-z0-9]+/).filter(Boolean);

export interface VideoMatch {
  fileName: string;
  exerciseId: string | null;
  /** 1 = every word matched both ways; matches below 0.6 aren't proposed. */
  score: number;
  /** Other exercises that scored the same, so the coach should choose. */
  ambiguousWith: string[];
}

/**
 * Proposes an exercise for each file. A file is matched when its words and the exercise name's
 * words overlap enough (Jaccard ≥ 0.6); ties are left for the coach to pick rather than guessed.
 */
export function matchVideos(fileNames: string[], lib: LibraryExercise[]): VideoMatch[] {
  return fileNames.map((fileName) => {
    const ft = new Set(filenameTokens(fileName));
    if (ft.size === 0) return { fileName, exerciseId: null, score: 0, ambiguousWith: [] };
    const scored = lib
      .map((e) => {
        const et = new Set(nameTokens(e.name));
        const inter = [...ft].filter((t) => et.has(t)).length;
        const union = new Set([...ft, ...et]).size;
        return { id: e.id, score: union ? inter / union : 0 };
      })
      .filter((s) => s.score >= 0.6)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return { fileName, exerciseId: null, score: 0, ambiguousWith: [] };
    const ties = scored.filter((s) => s.score === best.score).map((s) => s.id);
    if (ties.length > 1) return { fileName, exerciseId: null, score: best.score, ambiguousWith: ties };
    return { fileName, exerciseId: best.id, score: best.score, ambiguousWith: [] };
  });
}
