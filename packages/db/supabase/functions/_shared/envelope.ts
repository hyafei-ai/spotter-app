// Envelope encryption for store credentials (W-2).
// Each secret gets a fresh AES-256-GCM data key; the data key is wrapped (AES-KW) with the
// key-encryption key in CREDENTIALS_KEK (base64, 32 bytes), which lives only in function secrets.
// Rotate by adding a new KEK under a new CREDENTIALS_KEK_ID and re-wrapping data keys.

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function kek(): Promise<{ key: CryptoKey; id: string }> {
  const raw = Deno.env.get('CREDENTIALS_KEK');
  if (!raw) throw new Error('CREDENTIALS_KEK is not configured');
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error('CREDENTIALS_KEK must be 32 bytes, base64');
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-KW' }, false, ['wrapKey', 'unwrapKey']);
  return { key, id: Deno.env.get('CREDENTIALS_KEK_ID') ?? 'kek-1' };
}

export interface Sealed {
  ciphertext: string;
  iv: string;
  wrapped_key: string;
  kek_id: string;
  fingerprint: string;
}

export async function seal(plaintext: string): Promise<Sealed> {
  const { key: wrapping, id } = await kek();
  const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, data));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, wrapping, { name: 'AES-KW' }));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const hex = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  return { ciphertext: b64(ct), iv: b64(iv), wrapped_key: b64(wrapped), kek_id: id, fingerprint: `sha256:${hex}` };
}

/** Used only by the build worker (service role) when it hands credentials to EAS. */
export async function open(s: Pick<Sealed, 'ciphertext' | 'iv' | 'wrapped_key'>): Promise<string> {
  const { key: wrapping } = await kek();
  const dek = await crypto.subtle.unwrapKey('raw', unb64(s.wrapped_key), wrapping, { name: 'AES-KW' }, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, dek, unb64(s.ciphertext));
  return new TextDecoder().decode(pt);
}
