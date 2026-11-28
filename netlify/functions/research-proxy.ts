// Netlify Function (v2): read-only relay for research sources that send no CORS headers (arXiv).
// GET /api/research-proxy?u=<url>  — only allow-listed hosts, GET only, small responses, no cookies/keys.
export const config = { path: '/api/research-proxy' };

const ALLOW = new Set(['export.arxiv.org']);
const MAX = 600 * 1024;

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') return new Response('GET only', { status: 405 });
  const raw = new URL(req.url).searchParams.get('u') || '';
  let u: URL;
  try { u = new URL(raw); } catch { return new Response('bad url', { status: 400 }); }
  if (u.protocol !== 'https:' || !ALLOW.has(u.hostname)) return new Response('host not allowed', { status: 403 });
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const up = await fetch(u.toString(), { headers: { 'user-agent': 'LearningGalaxy/1.0 (research relay)' }, signal: ctl.signal });
    const body = (await up.text()).slice(0, MAX);
    return new Response(body, { status: up.status, headers: { 'content-type': up.headers.get('content-type') || 'text/plain', 'cache-control': 'public, max-age=3600' } });
  } catch {
    return new Response('upstream failed', { status: 502 });
  } finally { clearTimeout(timer); }
};
