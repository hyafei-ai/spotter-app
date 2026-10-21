import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Saves generated content (CSV template, export zip) and opens the share sheet. Web: files.web.ts downloads it. */
export async function saveAndShare(name: string, content: string | Uint8Array, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

/** Reads a picked file (expo-document-picker result URI) as text. */
export async function readText(uri: string): Promise<string> {
  return new File(uri).text();
}
