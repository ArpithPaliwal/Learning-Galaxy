// Loads lg-store.js + lg-runtime.js into a fake browser (vm context) and checks the window.claude shim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function boot({ fetch: fetchImpl, ai } = {}) {
  const ls = new Map();
  const opened = [];
  const win = {
    LG_CONFIG: { repo: 'me/repo', branch: 'main' },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    location: { hash: '', pathname: '/', search: '', origin: 'https://app.test', protocol: 'https:', host: 'app.test' },
    history: { replaceState() {} },
    navigator: { onLine: true },
    document: { addEventListener() {}, visibilityState: 'visible', createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
    addEventListener() {},
    open: (u) => opened.push(u),
    fetch: fetchImpl || (async () => { throw new Error('no network in tests'); }),
    setTimeout, clearTimeout, setInterval: () => 0, structuredClone, EventTarget, CustomEvent: globalThis.CustomEvent || class extends Event { constructor(t, o) { super(t); this.detail = o && o.detail; } },
    TextDecoder, Blob, URL, URLSearchParams, FileReader: class {}, console, Promise, JSON, Math, Date, Object, Array, String, Number, Error,
  };
  win.window = win; win.globalThis = win;
  if (ai) win.localStorage.setItem('lg.app.ai', JSON.stringify(ai));
  const ctx = vm.createContext(win);
  for (const f of ['app/lg-store.js', 'app/lg-runtime.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
  return { win, opened };
}

const jsonRes = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });
function sseRes(events) {
  const enc = new TextEncoder(); const chunks = events.map((e) => enc.encode('data: ' + JSON.stringify(e) + '\n\n'));
  return { ok: true, status: 200, body: { getReader: () => ({ read: async () => (chunks.length ? { value: chunks.shift(), done: false } : { done: true }) }) } };
}

test('window.claude.use exposes db, sample, mcp, downloads; not dictation/tts', async () => {
  const { win } = boot();
  for (const n of ['db', 'sample', 'mcp', 'downloads', 'permissions']) assert.ok(await win.claude.use(n), n);
  assert.equal(await win.claude.use('dictation'), null);
  assert.equal(await win.claude.use('tts'), null);
});

test('sample without a key fails with a readable message', async () => {
  const { win } = boot();
  const s = await win.claude.use('sample');
  await assert.rejects(s('hi'), (e) => e.code === 'no_key' && /AI key/.test(e.text));
});

test('sample calls Anthropic with browser header, model by tier, merged messages', async () => {
  let req;
  const { win } = boot({ ai: { provider: 'anthropic', key: 'sk-ant-x' }, fetch: async (url, o) => { req = { url, o, body: JSON.parse(o.body) }; return jsonRes({ content: [{ type: 'text', text: 'Hello' }] }); } });
  const s = await win.claude.use('sample');
  const r = await s([{ role: 'user', content: 'sys' }, { role: 'user', content: 'q' }], { modelTier: 'complex' });
  assert.equal(r.text, 'Hello');
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(req.o.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.messages.length, 1);
  assert.equal(req.body.messages[0].content, 'sys\n\nq');
});

test('sample streams text through onText', async () => {
  const { win } = boot({ ai: { provider: 'anthropic', key: 'k' }, fetch: async () => sseRes([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } }]) });
  const s = await win.claude.use('sample'); const seen = [];
  const r = await s('hi', { onText: ({ text }) => seen.push(text) });
  assert.equal(r.text, 'Hello'); assert.deepEqual(seen, ['Hel', 'Hello']);
});

test('sample.json parses fenced JSON; OpenAI-compatible providers use chat/completions', async () => {
  let url;
  const { win } = boot({ ai: { provider: 'custom', key: 'k', base: 'https://x.test/v1/', default: 'm1' }, fetch: async (u) => { url = u; return jsonRes({ choices: [{ message: { content: 'Sure:\n```json\n{"a":1}\n```' } }] }); } });
  const s = await win.claude.use('sample');
  assert.deepEqual(JSON.parse(JSON.stringify(await s.json('give json'))), { a: 1 });
  assert.equal(url, 'https://x.test/v1/chat/completions');
});

test('401 from the provider becomes bad_key', async () => {
  const { win } = boot({ ai: { provider: 'anthropic', key: 'k' }, fetch: async () => jsonRes({ error: { message: 'invalid x-api-key' } }, 401) });
  const s = await win.claude.use('sample');
  await assert.rejects(s('hi'), (e) => e.code === 'bad_key');
});

test('requestFeature without a token opens a prefilled GitHub issue', async () => {
  const { win, opened } = boot();
  const r = await win.LG.requestFeature('Streak calendar', 'On Today', { source: 'Jarvis' });
  assert.equal(r.opened, true);
  assert.match(opened[0], /^https:\/\/github\.com\/me\/repo\/issues\/new\?title=Feature%3A%20Streak%20calendar/);
  assert.match(decodeURIComponent(opened[0]), /Sent from the app/);
});

test('requestFeature with a token creates the issue via the API', async () => {
  let call;
  const { win } = boot({ fetch: async (u, o) => { call = { u, o }; return jsonRes({ number: 7, html_url: 'https://github.com/me/repo/issues/7' }); } });
  win.LG.GH.setToken('tok');
  const r = await win.LG.requestFeature('Dark map', 'x', { model: 'opus' });
  assert.equal(r.number, 7);
  assert.equal(call.u, 'https://api.github.com/repos/me/repo/issues');
  assert.equal(call.o.headers.authorization, 'Bearer tok');
  const body = JSON.parse(call.o.body);
  assert.equal(body.title, 'Feature: Dark map');
  assert.match(body.body, /Model: Opus/);
});

test('mcp fire_trigger maps to the GitHub cloud job', async () => {
  let call;
  const { win } = boot({ fetch: async (u, o) => { call = { u, body: JSON.parse(o.body) }; return { ok: true, status: 204, text: async () => '' }; } });
  win.LG.GH.setToken('tok');
  await win.LG.store.ready; await new Promise((r) => setTimeout(r, 0));
  const refresh = win.LG.store.get('meta/refresh');
  const mcp = await win.claude.use('mcp');
  await mcp.callTool('Claude Code Remote', 'fire_trigger', { trigger_id: refresh.courseTriggerId });
  assert.match(call.u, /actions\/workflows\/cloud-job\.yml\/dispatches$/);
  assert.equal(call.body.inputs.kind, 'courses');
});

test('feature request footer matches the Expenses app (builder, model, when)', async () => {
  const { win, opened } = boot();
  await win.LG.requestFeature('Dark map', 'x', { builder: 'claude', model: 'haiku', when: 'scheduled' });
  assert.match(decodeURIComponent(opened[0]), /Builder: Claude · Model: Haiku · When: Next scheduled run/);
  await win.LG.requestFeature('Idea', 'y', { builder: 'manual' });
  assert.match(decodeURIComponent(opened[1]), /Builder: Just save it\n/);
});
