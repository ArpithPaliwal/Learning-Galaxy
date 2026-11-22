// Netlify Function (v2): CORS fallback relay for AI providers that block browser requests.
// POST { url, method: 'POST', headers, body } -> upstream status + body text.
// Never log headers, bodies or keys.

declare const process: { env: Record<string, string | undefined> };

export const config = { path: '/api/ai-proxy' };

const MAX_BODY = 5 * 1024 * 1024; // Jarvis prompts carry app context and may include a photo
const MAX_RESPONSE = 512 * 1024;
const TIMEOUT_MS = 25_000;
const DROP = new Set(['host', 'origin', 'referer', 'cookie', 'content-length', 'connection', 'transfer-encoding', 'upgrade', 'proxy-authorization']);

const err = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** True for localhost, loopback, private, link-local and internal names/addresses. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h.includes(':')) {
    return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:') || h.startsWith('0:');
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

async function readLimited(res: Response, max: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(all);
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return err(405, 'method not allowed');

  const self = process.env.URL?.replace(/\/$/, '');
  if (self && req.headers.get('origin') !== self) return err(403, 'forbidden');

  const raw = await req.text();
  if (raw.length > MAX_BODY + 4096) return err(413, 'request too large');
  let p: { url?: unknown; method?: unknown; headers?: unknown; body?: unknown };
  try {
    p = JSON.parse(raw);
  } catch {
    return err(400, 'bad request');
  }
  if (typeof p.url !== 'string' || p.method !== 'POST') return err(400, 'bad request');
  const body = p.body === undefined ? '' : p.body;
  if (typeof body !== 'string') return err(400, 'bad request');
  if (new TextEncoder().encode(body).length > MAX_BODY) return err(413, 'request too large');

  let target: URL;
  try {
    target = new URL(p.url);
  } catch {
    return err(400, 'bad url');
  }
  if (target.protocol !== 'https:') return err(400, 'https only');
  if (target.username || target.password) return err(400, 'bad url');
  if (isPrivateHost(target.hostname)) return err(400, 'host not allowed');

  const headers = new Headers();
  if (p.headers && typeof p.headers === 'object') {
    for (const [k, v] of Object.entries(p.headers as Record<string, unknown>)) {
      if (typeof v !== 'string' || DROP.has(k.toLowerCase())) continue;
      try { headers.set(k, v); } catch { /* invalid header name/value */ }
    }
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // redirect: manual so an upstream cannot bounce us to an internal address.
    const up = await fetch(target.toString(), { method: 'POST', headers, body, signal: ctl.signal, redirect: 'manual' });
    const text = await readLimited(up, MAX_RESPONSE);
    if (text === null) return err(502, 'response too large');
    return new Response([204, 205, 304].includes(up.status) ? null : text, {
      status: up.status >= 200 && up.status < 600 ? up.status : 502,
      headers: {
        'content-type': up.headers.get('content-type') ?? 'text/plain',
        'cache-control': 'no-store',
        'x-proxy-upstream': '1',
      },
    });
  } catch {
    return err(504, 'upstream unavailable');
  } finally {
    clearTimeout(timer);
  }
};
