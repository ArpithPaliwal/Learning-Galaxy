#!/usr/bin/env node
// Hermes bridge: lets Jarvis (web + phone) hand work to the Hermes agent running on this PC.
//
//   Jarvis ──writes──▶ Supabase lg_docs  hermes/<id> {prompt, status:"pending"}
//   this bridge (PC) ──polls──▶ picks it up ──▶ Hermes API server (127.0.0.1:8642, full agent: tools, skills, memory)
//   reply streams back into hermes/<id> {reply, status:"running"→"done"}  ──sync──▶ Jarvis shows it
//
// No port is exposed to the internet: the only channel is your own Supabase table (row-level security = only you).
// Heartbeat: meta/hermes {online, seen, model} so the app can show "Hermes online".
//
// Env (from %LOCALAPPDATA%/learning-galaxy/mirror.env, never committed):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, [LG_USER_ID], HERMES_API_KEY, [HERMES_API_URL=http://127.0.0.1:8642/v1]
//   node scripts/hermes-bridge.mjs            (runs forever; started at logon by a scheduled task)
//   node scripts/hermes-bridge.mjs --once     (process the queue once and exit — for testing)
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILE = join(process.env.LOCALAPPDATA || join(process.env.HOME, '.config'), 'learning-galaxy', 'mirror.env');
if (existsSync(ENV_FILE)) for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, HERMES_API_KEY } = process.env;
const API = (process.env.HERMES_API_URL || 'http://127.0.0.1:8642/v1').replace(/\/+$/, '');
const ONCE = process.argv.includes('--once');
const POLL_MS = 4000, HEARTBEAT_MS = 60000, MAX_RUN_MS = 15 * 60e3;
const LOGF = join(process.env.LOCALAPPDATA || '.', 'learning-galaxy', 'hermes-bridge.log');
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(l); try { mkdirSync(join(LOGF, '..'), { recursive: true }); appendFileSync(LOGF, l + '\n'); } catch {} };
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { log('missing SUPABASE_URL / SUPABASE_SERVICE_KEY in', ENV_FILE); process.exit(2); }
if (!HERMES_API_KEY) { log('missing HERMES_API_KEY in', ENV_FILE); process.exit(2); }

const REST = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/lg_docs';
const H = { apikey: SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_KEY, 'content-type': 'application/json' };
let UID = process.env.LG_USER_ID || '';
async function userId() {
  if (UID) return UID;
  const r = await fetch(SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/admin/users?per_page=50', { headers: H });
  const users = r.ok ? ((await r.json()).users || []) : [];
  if (users.length === 1) UID = users[0].id;
  return UID;
}
async function rest(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error('supabase ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function getDoc(path) { const rows = await rest(`${REST}?user_id=eq.${UID}&path=eq.${encodeURIComponent(path)}&deleted=is.false&select=data`); return rows[0] ? rows[0].data : null; }
async function putDoc(col, id, data) {
  await rest(REST + '?on_conflict=user_id,path', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ user_id: UID, path: `${col}/${id}`, col, data: { ...data, updated: new Date().toISOString() }, updated: Date.now(), deleted: false }]) });
}
async function patchDoc(col, id, fields) { const cur = (await getDoc(`${col}/${id}`)) || {}; await putDoc(col, id, { ...cur, ...fields }); }

/* ------------------------------------------------------------ Hermes API */
async function hermesHealthy() {
  try { const r = await fetch(API + '/models', { headers: { authorization: 'Bearer ' + HERMES_API_KEY }, signal: AbortSignal.timeout(4000) }); return r.ok; } catch { return false; }
}
const SYSTEM = `You are Hermes, the agent running on Arpit's PC, answering through "Jarvis", the assistant panel of his study app Learning Galaxy (web + phone).
- Load the ai-brain skill when the request touches his learning data, the Brain/Kanban, research, the Obsidian vault or the app.
- You can really do things: research the web and papers, read/write his app data (node scripts/db.mjs in C:\\Users\\arpit\\learning-galaxy with the env file loaded), edit files, run scripts. Do the work, don't just describe it.
- Never change his progress fields (status, mode, notes, srs, log) unless he explicitly asks. Never invent URLs. Never print secrets.
- Your reply is shown in a narrow chat panel, often on a phone: lead with the answer or result, short Markdown, no tables wider than 3 columns.
- If something needs his decision or a password, say so plainly and stop.`;

async function runHermes(job, onDelta) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), MAX_RUN_MS);
  const messages = [{ role: 'system', content: SYSTEM + (job.context ? `\n\nApp context from Jarvis (may be partial):\n${String(job.context).slice(0, 6000)}` : '') },
    { role: 'user', content: String(job.prompt).slice(0, 8000) }];
  try {
    const r = await fetch(API + '/chat/completions', { method: 'POST', signal: ctl.signal,
      headers: { authorization: 'Bearer ' + HERMES_API_KEY, 'content-type': 'application/json', 'X-Hermes-Session-Key': 'learning-galaxy-jarvis', 'Idempotency-Key': 'lg-' + job.id },
      body: JSON.stringify({ model: process.env.HERMES_MODEL || 'hermes-agent', ...(process.env.HERMES_PROVIDER ? { provider: process.env.HERMES_PROVIDER } : {}), stream: true, messages }) });
    if (!r.ok) throw new Error('Hermes API ' + r.status + ': ' + (await r.text()).slice(0, 300));
    let text = '', buf = '', finish = '';
    const dec = new TextDecoder();
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue;
        try { const j = JSON.parse(d); const c = j.choices && j.choices[0]; if (c && c.delta && c.delta.content) { text += c.delta.content; onDelta(text); } if (c && c.finish_reason) finish = c.finish_reason; if (j.error) throw new Error(j.error.message || 'Hermes error'); } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; }
      }
    }
    if (finish === 'error') throw new Error(text.slice(-300) || 'Hermes reported an error');
    return { text: text.trim(), finish };
  } finally { clearTimeout(timer); }
}

/* ------------------------------------------------------------ loop */
let busy = false, lastBeat = 0, healthy = false;
async function beat(force) {
  if (!(await userId())) return;
  if (!force && Date.now() - lastBeat < HEARTBEAT_MS) return; lastBeat = Date.now();
  healthy = await hermesHealthy();
  try { await putDoc('meta', 'hermes', { online: healthy, bridge: true, seen: new Date().toISOString(), note: healthy ? 'Hermes is online on your PC.' : 'Bridge is running but the Hermes API server is not reachable (restart the Hermes app once after setup).' }); } catch (e) { log('heartbeat failed', e.message); }
}
async function tick() {
  if (busy) return; busy = true;
  try {
    if (!(await userId())) { log('no Supabase user yet'); return; }
    await beat(false);
    const rows = await rest(`${REST}?user_id=eq.${UID}&col=eq.hermes&deleted=is.false&data->>status=in.(pending,running)&select=path,data&order=updated.asc&limit=20`);
    const pending = rows.filter((r) => r.data && r.data.status === 'pending');
    // recover jobs stuck in "running" (bridge restarted mid-run)
    for (const r of rows) if (r.data && r.data.status === 'running' && Date.now() - Date.parse(r.data.started || 0) > MAX_RUN_MS + 60e3) await patchDoc('hermes', r.path.split('/')[1], { status: 'error', error: 'Timed out (bridge restarted?). Ask again.' });
    if (!pending.length) return;
    if (!healthy) { await beat(true); if (!healthy) { for (const r of pending) if (!r.data.waiting) await patchDoc('hermes', r.path.split('/')[1], { waiting: true, note: 'Waiting for Hermes on your PC…' }); return; } }
    for (const r of pending) {
      const id = r.path.split('/')[1]; const job = { id, ...r.data };
      log('job', id, JSON.stringify(String(job.prompt).slice(0, 80)));
      await patchDoc('hermes', id, { status: 'running', started: new Date().toISOString(), waiting: false, reply: '' });
      let last = 0, latest = '';
      const flush = async (force) => { if (!force && Date.now() - last < 2500) return; last = Date.now(); try { await patchDoc('hermes', id, { reply: latest }); } catch {} };
      try {
        const out = await runHermes(job, (t) => { latest = t; flush(false); });
        await patchDoc('hermes', id, { status: 'done', reply: out.text || '(Hermes finished without a reply.)', finished: new Date().toISOString(), finish: out.finish });
        log('done', id, out.finish, out.text.length + ' chars');
      } catch (e) {
        await patchDoc('hermes', id, { status: 'error', error: String(e.message || e).slice(0, 400), reply: latest, finished: new Date().toISOString() });
        log('error', id, e.message);
      }
    }
  } catch (e) { log('tick failed', e.message); }
  finally { busy = false; }
}

if (ONCE) { await beat(true); await tick(); log('once: hermes api', healthy ? 'online' : 'offline'); process.exit(0); }
log('bridge started; Hermes API', API);
await beat(true);
setInterval(tick, POLL_MS); tick();
process.on('SIGINT', async () => { try { await putDoc('meta', 'hermes', { online: false, bridge: false, seen: new Date().toISOString(), note: 'Bridge stopped.' }); } catch {} process.exit(0); });
