// Artifact edition: the runtime must keep the real window.claude and run on the artifact database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fakeArtifactDb() {
  const data = new Map(); const subs = new Set(); let writes = 0;
  const colOf = (p) => p.slice(0, p.indexOf('/'));
  const snap = (col) => { const docs = [...data].filter(([p]) => colOf(p) === col).map(([p, d]) => ({ id: p.slice(col.length + 1), exists: true, data: () => d })); return { docs, size: docs.length, empty: !docs.length }; };
  const fire = (col) => { for (const s of subs) if (s.col === col) s.cb(snap(col)); };
  return { data, get writes() { return writes; },
    doc: (path) => ({ id: path.split('/')[1], path, async get() { const d = data.get(path); return { exists: !!d, data: () => d }; }, async set(d) { writes++; data.set(path, d); fire(colOf(path)); }, async update(d) { data.set(path, Object.assign({}, data.get(path), d)); fire(colOf(path)); }, async delete() { data.delete(path); fire(colOf(path)); } }),
    collection: (col) => ({ onSnapshot(cb) { const s = { col, cb }; subs.add(s); Promise.resolve().then(() => cb(snap(col))); return () => subs.delete(s); }, async get() { return snap(col); } }),
  };
}

function boot() {
  const db = fakeArtifactDb(); const ls = new Map();
  const nativeClaude = { use: async (n) => (n === 'db' ? db : null) };
  const win = {
    claude: nativeClaude, LG_CONFIG: { repo: 'me/repo', supabaseUrl: 'https://sb.test', supabaseAnonKey: 'anon' },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    location: { hash: '', pathname: '/', search: '', origin: 'https://x.test', protocol: 'https:', host: 'x.test' }, history: { replaceState() {} }, navigator: { onLine: true },
    document: { addEventListener() {}, visibilityState: 'visible', documentElement: { getAttribute: () => 'dark' } }, addEventListener() {}, open() {},
    fetch: async () => ({ ok: false, status: 404 }), setTimeout, clearTimeout, setInterval: () => 0, structuredClone, EventTarget,
    CustomEvent: globalThis.CustomEvent || class extends Event { constructor(t, o) { super(t); this.detail = o && o.detail; } },
    TextDecoder, Blob, URL, URLSearchParams, FileReader: class {}, console, Promise, JSON, Math, Date, Object, Array, String, Number, Error,
  };
  win.window = win; const ctx = vm.createContext(win);
  for (const f of ['app/lg-store.js', 'app/lg-runtime.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
  return { win, db, nativeClaude };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('keeps the platform window.claude and flags artifact mode', async () => {
  const { win, nativeClaude } = boot();
  assert.equal(win.claude, nativeClaude, 'must not be replaced by the app shim');
  assert.equal(win.LG.ARTIFACT, true);
  assert.equal(win.LG.Sync.configured(), false, 'no Supabase sync from inside an artifact');
});

test('store mirrors the artifact database; db calls pass through', async () => {
  const { win, db } = boot(); await win.LG.store.ready;
  await db.doc('topics/a').set({ title: 'A' }); await tick();
  assert.equal(win.LG.store.count(), 1);
  assert.equal(win.LG.store.get('topics/a').title, 'A');
  assert.deepEqual(JSON.parse(JSON.stringify(win.LG.store.exportAll())), { topics: { a: { title: 'A' } } });
  assert.equal(win.LG.store.db, db);
});

test('importAll writes every valid record to the artifact database and reports progress', async () => {
  const { win, db } = boot(); await win.LG.store.ready;
  const backup = { topics: { t1: { title: 'T1', id: 't1' }, t2: { title: 'T2' }, 'bad id': { x: 1 } }, 'bad col': { z: {} }, meta: { profile: { name: 'me' } } };
  const n = await win.LG.store.importAll(backup);
  assert.equal(n, 3);
  assert.deepEqual([...db.data.keys()].sort(), ['meta/profile', 'topics/t1', 'topics/t2']);
  assert.equal(db.data.get('topics/t1').id, undefined, 'embedded id is dropped like in the app');
});

test('the public feed only adds items that are not stored yet', async () => {
  const { win, db } = boot(); await win.LG.store.ready;
  assert.equal(win.LG.store.applyRemote({ path: 'news/f1', data: { title: 'x' }, updated: 1, deleted: false }), true);
  await tick(); assert.equal(db.writes, 1);
  assert.equal(win.LG.store.applyRemote({ path: 'news/f1', data: { title: 'x' }, updated: 2, deleted: false }), false);
});

test('a feature request becomes a GitHub link instead of an API call', async () => {
  const { win } = boot(); let got = null;
  win.LG.bus.addEventListener('feature-link', (e) => (got = e.detail));
  const r = await win.LG.requestFeature('Dark map', 'details', { builder: 'claude', model: 'opus', when: 'now' });
  assert.equal(r.link, true); assert.match(r.url, /^https:\/\/github\.com\/me\/repo\/issues\/new\?title=Feature%3A%20Dark%20map/);
  assert.match(decodeURIComponent(r.url), /Builder: Claude · Model: Opus · When: Ship now/); assert.equal(got.title, 'Dark map');
});
