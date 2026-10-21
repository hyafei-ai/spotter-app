// Mux webhook signature check: header "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>".
// No Deno or npm imports, so it runs under Deno (Edge Functions) and Node (tests) alike.

export const MUX_TOLERANCE_S = 300;

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signMux(secret: string, rawBody: string, t: number): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${rawBody}`)}`;
}

/** True when the header matches the raw body and was signed within the tolerance window. */
export async function verifyMuxSignature(header: string | null, rawBody: string, secret: string, nowS = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !t || !v1 || Math.abs(nowS - t) > MUX_TOLERANCE_S) return false;
  return safeEqual(await hmacHex(secret, `${t}.${rawBody}`), v1);
}
