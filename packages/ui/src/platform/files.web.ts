/** Web: triggers a browser download instead of the native share sheet. */
export async function saveAndShare(name: string, content: string | Uint8Array, mimeType: string): Promise<void> {
  const part: BlobPart = typeof content === 'string' ? content : (content.slice().buffer as ArrayBuffer);
  const url = URL.createObjectURL(new Blob([part], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function readText(uri: string): Promise<string> {
  const res = await fetch(uri);
  return res.text();
}
