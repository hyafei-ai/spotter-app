import { File, Paths } from 'expo-file-system';
import { SAMPLE_CLIP } from './sampleClip';

/**
 * Keeps picked/recorded media somewhere that survives the picker's cache being cleared.
 * Native: copied into the app's documents folder. Web: see mediaStore.web.ts (IndexedDB).
 * References are plain strings stored with the record: "sample" for the demo clip, else a file URI.
 */
export type MediaRef = string;

export async function keepMedia(id: string, uri: string, ext: string): Promise<MediaRef> {
  const target = new File(Paths.document, `media-${id}.${ext}`);
  if (!target.exists) new File(uri).copy(target);
  return target.uri;
}

export async function resolveMedia(ref: MediaRef): Promise<string | number | null> {
  if (ref === 'sample') return SAMPLE_CLIP;
  return new File(ref).exists ? ref : null;
}
