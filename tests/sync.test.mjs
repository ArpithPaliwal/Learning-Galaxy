// Two "devices" syncing through a fake Supabase (PostgREST + the lg_docs trigger rules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fakeSupabase() {
  const rows = new Map(); let clock = 0; // path -> row
  const ts = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString();
  return { rows, fetch: async (url, o = {}) => {
    const u = new URL(url);
    if (!u.pathname.startsWith('/rest/v1/lg_docs')) return { ok: false, status: 404, text: async () => 'nope', json: async () => ({}) };
    assert.match(o.headers.authorization, /^Bearer tok-/, 'signed-in requests only');
    if ((o.method || 'GET') === 'POST') {
      for (const r of JSON.parse(o.body)) { const old = rows.get(r.path); if (old && r.updated < old.updated) continue; rows.set(r.path, { ...r, server_ts: ts() }); }
      return { ok: true, status: 201, text: async () => '', json: async () => null };
    }
    const gt = decodeURIComponent((u.search.match(/server_ts=gt\.([^&]+)/) || [])[1] || '');
    const out = [...rows.values()].filter((r) => r.server_ts > gt).sort((a, b) => a.server_ts.localeCompare(b.server_ts));
    return { ok: true, status: 200, text: async () => JSON.stringify(out), json: async () => out };
  } };
}

function device(sb, name) {
  const ls = new Map();
  const win = {
    LG_CONFIG: { repo: 'me/repo', supabaseUrl: 'https://sb.test', supabaseAnonKey: 'anon' },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    location: { hash: '', pathname: '/', search: '', origin: 'https://app.test', protocol: 'https:', host: 'app.test' },
    history: { replaceState() {} }, navigator: { onLine: true },
    document: { addEventListener() {}, visibilityState: 'visible', documentElement: { getAttribute: () => 'dark' } },
    addEventListener() {}, open() {}, fetch: sb.fetch, setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 5)), clearTimeout, setInterval: () => 0,
    structuredClone, EventTarget, CustomEvent: globalThis.CustomEvent || class extends Event { constructor(t, o) { super(t); this.detail = o && o.detail; } },
    TextDecoder, Blob, URL, URLSearchParams, FileReader: class {}, console, Promise, JSON, Math, Date, Object, Array, String, Number, Error,
  };
  win.window = win;
  win.localStorage.setItem('lg.app.sb.session', JSON.stringify({ access_token: 'tok-' + name, refresh_token: 'r', expires_at: Date.now() + 3600e3, user: { id: 'user-1', email: 'me@x' } }));
  const ctx = vm.createContext(win);
  for (const f of ['app/lg-store.js', 'app/lg-runtime.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
  return win.LG;
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test('phone writes, PC receives; deletes sync; newer edit wins', async () => {
  const sb = fakeSupabase(); const phone = device(sb, 'phone'), pc = device(sb, 'pc');
  await phone.store.ready; await pc.store.ready;
  await phone.store.db.doc('tasks/t1').set({ title: 'from phone' });
  await phone.Sync.run(); assert.equal(phone.Sync.state.status, 'ok');
  assert.equal(sb.rows.get('tasks/t1').data.title, 'from phone');
  assert.equal(sb.rows.get('tasks/t1').user_id, 'user-1');
  await pc.Sync.run(); assert.equal(pc.store.get('tasks/t1').title, 'from phone');
  // both edit; the later edit wins on both devices
  await pc.store.db.doc('tasks/t1').update({ title: 'pc edit' }); await settle();
  await phone.store.db.doc('tasks/t1').update({ title: 'phone edit (later)' });
  await pc.Sync.run(); await phone.Sync.run(); await pc.Sync.run();
  assert.equal(pc.store.get('tasks/t1').title, 'phone edit (later)');
  assert.equal(phone.store.get('tasks/t1').title, 'phone edit (later)');
  // delete travels too
  await pc.store.db.doc('tasks/t1').delete(); await pc.Sync.run(); await phone.Sync.run();
  assert.equal(phone.store.get('tasks/t1'), undefined);
});

test('nothing is lost while offline: changes wait and upload later', async () => {
  const sb = fakeSupabase(); const phone = device(sb, 'phone'); await phone.store.ready;
  await phone.store.db.doc('topics/x').set({ title: 'offline note' });
  phone.Sync.state.status = 'offline';
  assert.equal(phone.store.dirty().length >= 1, true);
  await phone.Sync.run(); assert.equal(sb.rows.get('topics/x').data.title, 'offline note'); assert.equal(phone.store.dirty().length, 0);
});

test('same-millisecond edits on two devices end up identical', async () => {
  const sb = fakeSupabase(); let t = 5000;
  const a = device(sb, 'a'), b = device(sb, 'b'); await a.store.ready; await b.store.ready;
  await a.store.db.doc('tasks/s').set({ v: 'a' }); await a.Sync.run(); await b.Sync.run();
  const now = Date.now; Date.now = () => 9e12; // both edits get the exact same timestamp
  try { await a.store.db.doc('tasks/s').set({ v: 'A' }); await b.store.db.doc('tasks/s').set({ v: 'B' }); } finally { Date.now = now; }
  await a.Sync.run(); await b.Sync.run(); await a.Sync.run();
  assert.equal(a.store.get('tasks/s').v, b.store.get('tasks/s').v);
  assert.equal(a.store.get('tasks/s').v, sb.rows.get('tasks/s').data.v);
});
