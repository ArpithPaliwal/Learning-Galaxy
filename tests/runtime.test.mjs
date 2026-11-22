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

test('Groq key: detected, OpenAI-compatible call with bearer auth and its default model', async () => {
  let req;
  const { win } = boot({ ai: { key: 'gsk_abc' }, fetch: async (u, o) => { req = { u, o, body: JSON.parse(o.body) }; return jsonRes({ choices: [{ message: { content: 'hi' } }] }); } });
  assert.equal(win.LG.detectProvider('gsk_abc'), 'groq');
  const s = await win.claude.use('sample');
  assert.equal((await s('hello')).text, 'hi');
  assert.equal(req.u, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(req.o.headers.authorization, 'Bearer gsk_abc');
  assert.equal(req.body.model, 'llama-3.3-70b-versatile');
});

test('Gemini uses generateContent with x-goog-api-key and model roles', async () => {
  let req;
  const { win } = boot({ ai: { provider: 'gemini', key: 'AIzaX' }, fetch: async (u, o) => { req = { u, o, body: JSON.parse(o.body) }; return jsonRes({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }); } });
  const s = await win.claude.use('sample');
  const r = await s([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]);
  assert.equal(r.text, 'ok');
  assert.equal(req.u, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(req.o.headers['x-goog-api-key'], 'AIzaX');
  assert.deepEqual(req.body.contents.map((c) => c.role), ['user', 'model', 'user']);
});

test('a browser-blocked provider falls back to the app relay and remembers it', async () => {
  const calls = [];
  const { win } = boot({ ai: { provider: 'cerebras', key: 'csk-1' }, fetch: async (u, o) => {
    if (u === 'feed/latest.json') return { ok: false, status: 404 }; // the daily feed loader, not under test here
    calls.push(u);
    if (u.startsWith('https://api.cerebras.ai')) throw new TypeError('Failed to fetch');
    const inner = JSON.parse(o.body); assert.equal(inner.url, 'https://api.cerebras.ai/v1/chat/completions'); assert.equal(inner.headers.authorization, 'Bearer csk-1');
    return { ok: true, status: 200, headers: { get: () => '1' }, json: async () => ({ choices: [{ message: { content: 'relayed' } }] }), text: async () => '' };
  } });
  const s = await win.claude.use('sample');
  const r = await s('x');
  assert.equal(r.text, 'relayed'); assert.equal(r.route, 'proxy');
  assert.deepEqual(calls, ['https://api.cerebras.ai/v1/chat/completions', '/api/ai-proxy']);
  await s('again'); assert.equal(calls[2], '/api/ai-proxy', 'remembers to use the relay');
});

test('local providers need no key', async () => {
  let u0;
  const { win } = boot({ ai: { provider: 'ollama' }, fetch: async (u) => { u0 = u; return jsonRes({ choices: [{ message: { content: 'local' } }] }); } });
  const s = await win.claude.use('sample');
  assert.equal((await s('x')).text, 'local'); assert.equal(u0, 'http://localhost:11434/v1/chat/completions');
});

test('a Groq key saved while "Claude" is selected still goes to Groq', async () => {
  let u0;
  const { win } = boot({ ai: { provider: 'anthropic', key: ' gsk_real ', default: 'claude-x' }, fetch: async (u, o) => { u0 = { u, auth: o.headers.authorization, model: JSON.parse(o.body).model }; return jsonRes({ choices: [{ message: { content: 'ok' } }] }); } });
  assert.equal(win.LG.aiCfg().provider, 'groq');
  const s = await win.claude.use('sample');
  assert.equal((await s('x')).text, 'ok');
  assert.deepEqual(JSON.parse(JSON.stringify(u0)), { u: 'https://api.groq.com/openai/v1/chat/completions', auth: 'Bearer gsk_real', model: 'llama-3.3-70b-versatile' });
});

test('a rejected key shows the provider message', async () => {
  const { win } = boot({ ai: { provider: 'groq', key: 'gsk_bad' }, fetch: async () => jsonRes({ error: { message: 'Invalid API Key' } }, 401) });
  const s = await win.claude.use('sample');
  await assert.rejects(s('x'), (e) => e.code === 'bad_key' && /Invalid API Key/.test(e.text) && /Groq/.test(e.text));
});

test('a course request goes to GitHub as a "Course:" issue (API with a token, prefilled link without)', async () => {
  let call;
  const a = boot({ fetch: async (u, o) => { call = { u, body: JSON.parse(o.body) }; return jsonRes({ number: 9, html_url: 'https://github.com/me/repo/issues/9' }); } });
  a.win.LG.GH.setToken('tok');
  const r = await a.win.LG.GH.requestCourse('  Build\n an LLM   from scratch ', 'beginner', 30);
  assert.equal(r.number, 9); assert.equal(call.u, 'https://api.github.com/repos/me/repo/issues');
  assert.equal(call.body.title, 'Course: Build an LLM from scratch');
  assert.doesNotMatch(call.body.body, /Sent from the app/, 'must not be mistaken for a feature request');
  const b = boot();
  const r2 = await b.win.LG.GH.requestCourse('RAG basics', 'intermediate', 45);
  assert.equal(r2.link, true); assert.match(r2.url, /issues\/new\?title=Course%3A%20RAG%20basics/); assert.equal(b.opened.length, 1);
});
