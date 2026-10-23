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
  /** Other names coaches write on a whiteboard ("OHP", "T2B", "C&J"), for search and paste parsing. */
  aliases: z.array(z.string()).optional(),
});
export type LibraryExercise = z.infer<typeof LibraryExercise>;

type Seed = [id: string, name: string, metric: ExerciseMetric, tags: string[], equipment: string[], aliases?: string[]];

const SEED: Seed[] = [
  ['back-squat', 'Back Squat', 'weight_reps', ['legs', 'squat'], ['barbell', 'rack'], ['BS', 'high bar squat', 'low bar squat']],
  ['front-squat', 'Front Squat', 'weight_reps', ['legs', 'squat'], ['barbell', 'rack'], ['FS']],
  ['safety-bar-squat', 'Safety Bar Squat', 'weight_reps', ['legs', 'squat'], ['safety bar', 'rack']],
  ['goblet-squat', 'Goblet Squat', 'weight_reps', ['legs', 'squat'], ['dumbbell'], ['KB goblet squat']],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'weight_reps', ['legs', 'single leg'], ['dumbbell', 'bench']],
  ['walking-lunge', 'Walking Lunge', 'weight_reps', ['legs', 'single leg'], ['dumbbell'], ['lunges', 'DB lunge']],
  ['leg-press', 'Leg Press', 'weight_reps', ['legs'], ['machine']],
  ['deadlift', 'Deadlift', 'weight_reps', ['posterior chain', 'hinge'], ['barbell'], ['DL', 'conventional deadlift']],
  ['romanian-deadlift', 'Romanian Deadlift', 'weight_reps', ['posterior chain', 'hinge'], ['barbell'], ['RDL']],
  ['db-rdl', 'Dumbbell RDL', 'weight_reps', ['posterior chain', 'hinge'], ['dumbbell']],
  ['hip-thrust', 'Hip Thrust', 'weight_reps', ['posterior chain', 'glutes'], ['barbell', 'bench']],
  ['leg-curl', 'Lying Leg Curl', 'weight_reps', ['legs', 'hamstrings'], ['machine']],
  ['calf-raise', 'Standing Calf Raise', 'weight_reps', ['legs', 'calves'], ['machine']],
  ['bench-press', 'Bench Press', 'weight_reps', ['push', 'chest'], ['barbell', 'bench'], ['BP', 'bench']],
  ['incline-db-press', 'Incline Dumbbell Press', 'weight_reps', ['push', 'chest'], ['dumbbell', 'bench']],
  ['overhead-press', 'Overhead Press', 'weight_reps', ['push', 'shoulders'], ['barbell'], ['OHP', 'strict press', 'shoulder press', 'press']],
  ['db-shoulder-press', 'Seated Dumbbell Press', 'weight_reps', ['push', 'shoulders'], ['dumbbell', 'bench']],
  ['push-up', 'Push-up', 'bodyweight_reps', ['push', 'chest'], ['bodyweight'], ['pushup', 'press-up']],
  ['dip', 'Dip', 'bodyweight_reps', ['push', 'triceps'], ['dip bars']],
  ['triceps-pushdown', 'Triceps Pushdown', 'weight_reps', ['push', 'triceps'], ['cable']],
  ['lateral-raise', 'Lateral Raise', 'weight_reps', ['push', 'shoulders'], ['dumbbell']],
  ['pull-up', 'Pull-up', 'bodyweight_reps', ['pull', 'back'], ['pull-up bar'], ['pullup', 'strict pull-up', 'PU']],
  ['chin-up', 'Chin-up', 'bodyweight_reps', ['pull', 'back'], ['pull-up bar'], ['chinup']],
  ['lat-pulldown', 'Lat Pulldown', 'weight_reps', ['pull', 'back'], ['cable']],
  ['barbell-row', 'Barbell Row', 'weight_reps', ['pull', 'back'], ['barbell'], ['BB row', 'bent over row', 'bent-over row']],
  ['db-row', 'One-arm Dumbbell Row', 'weight_reps', ['pull', 'back'], ['dumbbell', 'bench'], ['DB row', 'dumbbell row']],
  ['seated-cable-row', 'Seated Cable Row', 'weight_reps', ['pull', 'back'], ['cable']],
  ['face-pull', 'Face Pull', 'weight_reps', ['pull', 'shoulders'], ['cable']],
  ['biceps-curl', 'Dumbbell Curl', 'weight_reps', ['pull', 'biceps'], ['dumbbell']],
  ['plank', 'Plank', 'time', ['core'], ['bodyweight']],
  ['side-plank', 'Side Plank', 'time', ['core'], ['bodyweight']],
  ['dead-bug', 'Dead Bug', 'bodyweight_reps', ['core'], ['bodyweight']],
  ['hanging-knee-raise', 'Hanging Knee Raise', 'bodyweight_reps', ['core'], ['pull-up bar']],
  ['pallof-press', 'Pallof Press', 'weight_reps', ['core'], ['cable']],
  ['farmer-carry', 'Farmer Carry', 'distance', ['carry', 'grip'], ['dumbbell'], ['farmers carry', 'farmers walk', 'farmer walk', "farmer's carry"]],
  ['suitcase-carry', 'Suitcase Carry', 'distance', ['carry', 'core'], ['dumbbell']],
  ['sled-push', 'Sled Push', 'distance', ['conditioning'], ['sled'], ['sled pushes']],
  ['rower', 'Row Erg', 'distance', ['conditioning'], ['rower'], ['row', 'rowing', 'rower', 'C2 row']],
  ['bike-intervals', 'Bike Intervals', 'time', ['conditioning'], ['bike']],
  ['kettlebell-swing', 'Kettlebell Swing', 'weight_reps', ['posterior chain', 'hinge'], ['kettlebell'], ['KB swing', 'KBS', 'American KB swing', 'Russian KB swing']],

  /* ---- Appended from Station Zero's movement library (docs/ports.md row 3). Ids above stay stable. ---- */
  // Barbell and Olympic lifting
  ['overhead-squat', 'Overhead Squat', 'weight_reps', ['legs', 'squat', 'olympic'], ['barbell'], ['OHS']],
  ['sumo-deadlift', 'Sumo Deadlift', 'weight_reps', ['posterior chain', 'hinge'], ['barbell'], ['SDL']],
  ['push-press', 'Push Press', 'weight_reps', ['push', 'shoulders'], ['barbell'], ['PP']],
  ['push-jerk', 'Push Jerk', 'weight_reps', ['push', 'olympic'], ['barbell'], ['PJ']],
  ['split-jerk', 'Split Jerk', 'weight_reps', ['push', 'olympic'], ['barbell']],
  ['snatch', 'Snatch', 'weight_reps', ['posterior chain', 'olympic'], ['barbell'], ['squat snatch', 'full snatch']],
  ['power-snatch', 'Power Snatch', 'weight_reps', ['posterior chain', 'olympic'], ['barbell'], ['PS']],
  ['hang-snatch', 'Hang Snatch', 'weight_reps', ['posterior chain', 'olympic'], ['barbell']],
  ['hang-power-snatch', 'Hang Power Snatch', 'weight_reps', ['posterior chain', 'olympic'], ['barbell'], ['HPS']],
  ['clean-and-jerk', 'Clean and Jerk', 'weight_reps', ['posterior chain', 'olympic'], ['barbell'], ['C&J', 'clean & jerk', 'CnJ']],
  ['clean', 'Clean', 'weight_reps', ['posterior chain', 'olympic'], ['barbell'], ['squat clean', 'full clean']],
  ['power-clean', 'Power Clean', 'weight_reps', ['posterior chain', 'olympic'], ['barbell'], ['PC']],
  ['hang-clean', 'Hang Clean', 'weight_reps', ['posterior chain', 'olympic'], ['barbell']],
  ['hang-power-clean', 'Hang Power Clean', 'weight_reps', ['posterior chain', 'olympic'], ['barbell'], ['HPC']],
  ['thruster', 'Thruster', 'weight_reps', ['legs', 'push'], ['barbell']],
  ['wall-ball', 'Wall Ball', 'weight_reps', ['legs', 'push', 'conditioning'], ['medicine ball'], ['wall ball shot', 'WB', 'WBS']],
  ['sandbag-carry', 'Sandbag Carry', 'distance', ['carry', 'core'], ['sandbag'], ['sandbag walk']],
  ['pendlay-row', 'Pendlay Row', 'weight_reps', ['pull', 'back'], ['barbell']],
  ['good-morning', 'Good Morning', 'weight_reps', ['posterior chain', 'hinge'], ['barbell']],
  ['glute-bridge', 'Glute Bridge', 'weight_reps', ['posterior chain', 'glutes'], ['barbell']],
  ['db-bench-press', 'Dumbbell Bench Press', 'weight_reps', ['push', 'chest'], ['dumbbell', 'bench'], ['DB bench', 'DB bench press']],
  ['incline-bench-press', 'Incline Bench Press', 'weight_reps', ['push', 'chest'], ['barbell', 'bench'], ['incline bench']],
  ['close-grip-bench', 'Close-Grip Bench Press', 'weight_reps', ['push', 'triceps'], ['barbell', 'bench'], ['CGBP', 'close grip bench']],
  ['weighted-dip', 'Weighted Dip', 'weight_reps', ['push', 'triceps'], ['dip bars', 'dip belt']],
  ['weighted-pull-up', 'Weighted Pull-up', 'weight_reps', ['pull', 'back'], ['pull-up bar', 'dip belt']],
  // Gymnastics
  ['kipping-pull-up', 'Kipping Pull-up', 'bodyweight_reps', ['pull', 'gymnastics'], ['pull-up bar'], ['kipping pullup', 'kipping PU']],
  ['butterfly-pull-up', 'Butterfly Pull-up', 'bodyweight_reps', ['pull', 'gymnastics'], ['pull-up bar'], ['butterfly pullup', 'butterfly PU']],
  ['chest-to-bar', 'Chest-to-Bar Pull-up', 'bodyweight_reps', ['pull', 'gymnastics'], ['pull-up bar'], ['C2B', 'CTB', 'chest to bar']],
  ['bar-muscle-up', 'Bar Muscle-up', 'bodyweight_reps', ['pull', 'gymnastics'], ['pull-up bar'], ['BMU', 'bar muscle up']],
  ['ring-muscle-up', 'Ring Muscle-up', 'bodyweight_reps', ['pull', 'gymnastics'], ['rings'], ['RMU', 'ring muscle up', 'muscle-up', 'MU']],
  ['strict-hspu', 'Strict Handstand Push-up', 'bodyweight_reps', ['push', 'gymnastics'], ['wall'], ['strict HSPU', 'strict handstand pushup']],
  ['kipping-hspu', 'Kipping Handstand Push-up', 'bodyweight_reps', ['push', 'gymnastics'], ['wall'], ['HSPU', 'kipping HSPU', 'handstand push-up', 'handstand pushup']],
  ['deficit-hspu', 'Deficit Handstand Push-up', 'bodyweight_reps', ['push', 'gymnastics'], ['wall', 'plates'], ['deficit HSPU']],
  ['toes-to-bar', 'Toes-to-Bar', 'bodyweight_reps', ['core', 'gymnastics'], ['pull-up bar'], ['T2B', 'TTB', 'toes to bar']],
  ['knees-to-elbows', 'Knees-to-Elbows', 'bodyweight_reps', ['core', 'gymnastics'], ['pull-up bar'], ['K2E', 'knees to elbows']],
  ['pistol-squat', 'Pistol Squat', 'bodyweight_reps', ['legs', 'single leg', 'gymnastics'], ['bodyweight'], ['pistol', 'single-leg squat']],
  ['air-squat', 'Air Squat', 'bodyweight_reps', ['legs', 'squat'], ['bodyweight'], ['bodyweight squat', 'squat']],
  ['rope-climb', 'Rope Climb', 'bodyweight_reps', ['pull', 'gymnastics'], ['rope']],
  ['legless-rope-climb', 'Legless Rope Climb', 'bodyweight_reps', ['pull', 'gymnastics'], ['rope'], ['legless']],
  ['handstand-walk', 'Handstand Walk', 'distance', ['push', 'gymnastics'], ['bodyweight'], ['HSW', 'HS walk']],
  ['ring-dip', 'Ring Dip', 'bodyweight_reps', ['push', 'gymnastics'], ['rings'], ['strict ring dip']],
  ['ghd-sit-up', 'GHD Sit-up', 'bodyweight_reps', ['core', 'gymnastics'], ['GHD'], ['GHD', 'GHD situp']],
  ['sit-up', 'Sit-up', 'bodyweight_reps', ['core'], ['bodyweight'], ['situp', 'AbMat sit-up']],
  ['l-sit', 'L-Sit', 'time', ['core', 'gymnastics'], ['parallettes'], ['L sit']],
  ['burpee', 'Burpee', 'bodyweight_reps', ['conditioning'], ['bodyweight']],
  ['box-jump', 'Box Jump', 'bodyweight_reps', ['legs', 'conditioning'], ['box'], ['BJ']],
  ['box-jump-over', 'Box Jump Over', 'bodyweight_reps', ['legs', 'conditioning'], ['box'], ['BJO']],
  ['double-under', 'Double-under', 'bodyweight_reps', ['conditioning', 'monostructural'], ['jump rope'], ['DU', 'double unders', 'dubs']],
  // Monostructural and race stations: Spotter additions (the source library left these out)
  ['run', 'Run', 'distance', ['conditioning', 'monostructural'], ['bodyweight'], ['running', 'jog', 'sprint']],
  ['ski-erg', 'SkiErg', 'distance', ['conditioning', 'monostructural'], ['ski erg'], ['ski', 'ski erg']],
  ['bike-erg', 'Bike Erg', 'distance', ['conditioning', 'monostructural'], ['bike'], ['bikeerg', 'C2 bike']],
  ['air-bike', 'Air Bike', 'time', ['conditioning', 'monostructural'], ['air bike'], ['assault bike', 'echo bike', 'fan bike', 'bike']],
  ['swim', 'Swim', 'distance', ['conditioning', 'monostructural'], ['pool'], ['swimming']],
  ['sled-pull', 'Sled Pull', 'distance', ['conditioning'], ['sled', 'rope']],
  ['burpee-broad-jump', 'Burpee Broad Jump', 'distance', ['conditioning'], ['bodyweight'], ['BBJ']],
  ['sandbag-lunge', 'Sandbag Lunge', 'distance', ['legs', 'single leg', 'conditioning'], ['sandbag'], ['sandbag walking lunge']],
];

export const STARTER_LIBRARY: LibraryExercise[] = SEED.map(([id, name, metric, tags, equipment, aliases]) => ({
  id,
  name,
  metric,
  tags,
  equipment,
  isCustom: false,
  demoVideo: null,
  ...(aliases?.length ? { aliases } : {}),
}));

export const libraryTags = (lib: LibraryExercise[]) => [...new Set(lib.flatMap((e) => e.tags))].sort();
export const libraryEquipment = (lib: LibraryExercise[]) => [...new Set(lib.flatMap((e) => e.equipment))].sort();

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

/** Letters and digits only: "Pull-up" and "pullup" both become "pullup", "C&J" becomes "cj". */
const squash = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');

/**
 * Name search (every word must match the start of a word in the name, a tag or an alias), then tag/equipment
 * filters. A query matching the start of a name or alias with the punctuation taken out also counts, so
 * "pullup" finds Pull-up and "t2b" finds Toes-to-Bar.
 */
export function searchLibrary(lib: LibraryExercise[], query: string, filter: { tag?: string | null; equipment?: string | null } = {}): LibraryExercise[] {
  const words = norm(query).split(/[^a-z0-9]+/).filter(Boolean);
  const whole = squash(query);
  return lib
    .filter((e) => (!filter.tag || e.tags.includes(filter.tag)) && (!filter.equipment || e.equipment.includes(filter.equipment)))
    .filter((e) => {
      if (words.length === 0) return true;
      const aliases = e.aliases ?? [];
      const hay = norm(`${e.name} ${e.tags.join(' ')} ${aliases.join(' ')}`).split(/[^a-z0-9]+/);
      if (words.every((w) => hay.some((h) => h.startsWith(w)))) return true;
      return whole.length >= 2 && [e.name, ...aliases].some((n) => squash(n).startsWith(whole));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "thrusters" → "thruster", "pullups" → "pullup". Only used for exact lookups. */
function singular(s: string): string {
  if (s.length > 4 && s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.length > 4 && s.endsWith('ches')) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

/**
 * The library exercise a written movement name means, by exact name or alias (ignoring case, punctuation and a
 * plural "s"), or null. Exact only: "Back Squat" is found, "squat variation" is not guessed. Used by the paste
 * parser (parse/) to link "21 Thrusters" to the thruster entry.
 */
export function findLibraryExercise(lib: LibraryExercise[], written: string): LibraryExercise | null {
  const q = squash(written);
  if (!q) return null;
  const qs = singular(q);
  for (const e of lib) {
    for (const n of [e.name, ...(e.aliases ?? [])]) {
      const c = squash(n);
      if (c === q || singular(c) === qs) return e;
    }
  }
  return null;
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
