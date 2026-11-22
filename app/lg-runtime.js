/* Learning Galaxy — app runtime.
 * The app (index.html) was written as a claude.ai artifact and asks `window.claude.use(name)` for
 * db / sample (AI) / mcp / dictation / tts / downloads / permissions. This file provides the same
 * calls in a normal browser so the app runs as an installable PWA:
 *   db        → on-device IndexedDB store (lg-store.js) + optional Supabase cloud sync
 *   sample    → your own AI key (Anthropic, or any OpenAI-compatible provider)
 *   mcp       → "fire_trigger" becomes a GitHub Actions run of the cloud job
 *   downloads → a normal file download
 *   dictation / tts → not provided, so the app uses the browser's own speech engines
 * It also exposes window.LG for the App panel (lg-app.js) and Jarvis' build_feature action. */
(function () {
  'use strict';
  const CONF = Object.assign({ repo: 'ArpithPaliwal/Learning-Galaxy', branch: 'main', supabaseUrl: '', supabaseAnonKey: '' }, window.LG_CONFIG || {});

  /* ---------- settings (per device) ---------- */
  const K = 'lg.app.';
  const cfg = {
    get(k, d) { try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(K + k); else localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) {} },
  };
  const bus = new EventTarget();
  const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
  const err = (code, msg, extra) => Object.assign(new Error(msg || code), { code, text: msg || '' }, extra || {});

  /* ---------- store ---------- */
  const store = window.LGStore.createStore({ name: 'learning-galaxy' });
  store.onChange(() => { emit('data'); Sync.soon(); });

  /* ---------- AI ---------- */
  const PROVIDERS = {
    anthropic: { label: 'Claude (Anthropic)', base: 'https://api.anthropic.com/v1', models: { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' }, keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys' },
    openrouter: { label: 'OpenRouter (any model)', base: 'https://openrouter.ai/api/v1', models: { quick: '', default: '', complex: '' }, keyHint: 'sk-or-…', keyUrl: 'https://openrouter.ai/keys' },
    gemini: { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', models: { quick: '', default: '', complex: '' }, keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey' },
    openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', models: { quick: '', default: '', complex: '' }, keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys' },
    custom: { label: 'Other (OpenAI-compatible)', base: '', models: { quick: '', default: '', complex: '' }, keyHint: 'key', keyUrl: '' },
  };
  function aiCfg() {
    const c = cfg.get('ai', {}) || {}; const id = PROVIDERS[c.provider] ? c.provider : (c.key && !/^sk-ant-/.test(c.key) ? 'custom' : 'anthropic');
    const P = PROVIDERS[id];
    return { provider: id, key: c.key || '', base: (c.base || P.base || '').replace(/\/+$/, ''), models: { quick: c.quick || P.models.quick || c.default || P.models.default, default: c.default || P.models.default, complex: c.complex || P.models.complex || c.default || P.models.default } };
  }
  const fileToB64 = (f) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(f); });
  function normMsgs(input) {
    let msgs = typeof input === 'string' ? [{ role: 'user', content: input }] : (Array.isArray(input) ? input : [input]).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: typeof m.content === 'string' ? m.content : (m.content == null ? '' : m.content) }));
    msgs = msgs.filter((m) => m.content !== '' && m.content != null);
    const out = [];
    for (const m of msgs) { const last = out[out.length - 1]; if (last && last.role === m.role && typeof last.content === 'string' && typeof m.content === 'string') last.content += '\n\n' + m.content; else out.push(Object.assign({}, m)); }
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }
  async function readSSE(res, onData) {
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('data:')) { const d = line.slice(5).trim(); if (d && d !== '[DONE]') { try { onData(JSON.parse(d)); } catch (e) {} } } }
    }
  }
  function httpErr(status, body) {
    const msg = (() => { try { const j = JSON.parse(body); return (j.error && (j.error.message || j.error)) || j.message || body; } catch (e) { return body; } })();
    if (status === 401 || status === 403) return err('bad_key', 'Your AI key was rejected (' + status + '). Open ⚡ App → AI brain and check it.');
    if (status === 429) return err('rate_limited', 'Rate limited by your AI provider. Wait a minute and try again.');
    if (status === 400 && /image/i.test(String(msg))) return err('image_rejected', 'The AI could not read that image.');
    return err('ai_error', 'AI request failed (' + status + '): ' + String(msg).slice(0, 240));
  }
  async function sample(input, opts = {}) {
    const c = aiCfg();
    if (!c.key) { if (Date.now() - (sample._nag || 0) > 20000) { sample._nag = Date.now(); setTimeout(() => window.LG && window.LG.openPanel && window.LG.openPanel('ai'), 400); } }
    if (!c.key) throw err('no_key', 'I need an AI key to think. Tap **⚡ App** (top bar) → **AI brain**, paste a Claude API key (or another provider), then ask me again.');
    const tier = ['quick', 'default', 'complex'].includes(opts.modelTier) ? opts.modelTier : 'default';
    const model = c.models[tier];
    if (!model) throw err('no_model', 'Pick a model name for ' + PROVIDERS[c.provider].label + ' in ⚡ App → AI brain.');
    const msgs = normMsgs(input); if (!msgs.length) throw err('empty', 'Nothing to send.');
    const images = await Promise.all((opts.images || []).slice(0, 4).map(async (f) => (typeof f === 'string' ? f : await fileToB64(f))));
    const stream = typeof opts.onText === 'function';
    const maxTokens = opts.maxTokens || (tier === 'complex' ? 16000 : 8000);
    let text = '';
    const tick = (t) => { text += t; if (stream) { try { opts.onText({ text, delta: t }); } catch (e) {} } };
    try {
      if (c.provider === 'anthropic') {
        if (images.length) { const last = msgs[msgs.length - 1]; last.content = [...images.map((u) => { const m = /^data:([^;]+);base64,(.*)$/.exec(u) || []; return { type: 'image', source: { type: 'base64', media_type: m[1] || 'image/jpeg', data: m[2] || '' } }; }), { type: 'text', text: String(last.content) }]; }
        const res = await fetch(c.base + '/messages', { method: 'POST', signal: opts.signal, headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: maxTokens, messages: msgs, stream }) });
        if (!res.ok) throw httpErr(res.status, await res.text());
        if (stream) await readSSE(res, (ev) => { if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') tick(ev.delta.text); if (ev.type === 'error') throw err('ai_error', (ev.error && ev.error.message) || 'AI stream error'); });
        else { const j = await res.json(); text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''); }
      } else {
        if (!c.base) throw err('no_base', 'Set the provider URL in ⚡ App → AI brain.');
        if (images.length) { const last = msgs[msgs.length - 1]; last.content = [{ type: 'text', text: String(last.content) }, ...images.map((u) => ({ type: 'image_url', image_url: { url: u } }))]; }
        const res = await fetch(c.base + '/chat/completions', { method: 'POST', signal: opts.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key }, body: JSON.stringify({ model, messages: msgs, stream, max_tokens: maxTokens }) });
        if (!res.ok) throw httpErr(res.status, await res.text());
        if (stream) await readSSE(res, (ev) => { const d = ev.choices && ev.choices[0] && ev.choices[0].delta; if (d && d.content) tick(d.content); });
        else { const j = await res.json(); text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''; }
      }
    } catch (e) {
      if (e && (e.name === 'AbortError' || (opts.signal && opts.signal.aborted))) throw err('cancelled', '', { text });
      if (e && e.code) { if (text && !e.partial) e.partial = text; throw e; }
      throw err('network', navigator.onLine === false ? 'You are offline. Connect to the internet and try again.' : 'Could not reach the AI provider (' + (e && e.message) + ').');
    }
    return { text };
  }
  function parseLoose(t) {
    const tries = [t]; const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/); if (f) tries.push(f[1]);
    for (const [a, b] of [['{', '}'], ['[', ']']]) { const i = t.indexOf(a), j = t.lastIndexOf(b); if (i >= 0 && j > i) tries.push(t.slice(i, j + 1)); }
    for (const x of tries) { try { return JSON.parse(x); } catch (e) {} }
    return undefined;
  }
  sample.json = async (input, opts = {}) => {
    const tail = '\n\nReply with ONLY valid JSON (no prose, no Markdown fences).';
    const inp = typeof input === 'string' ? input + tail : normMsgs(input).map((m, i, a) => (i === a.length - 1 && typeof m.content === 'string' ? Object.assign({}, m, { content: m.content + tail }) : m));
    const r = await sample(inp, Object.assign({}, opts, { onText: undefined }));
    const v = parseLoose(r.text);
    if (v === undefined) throw err('bad_json', 'The AI reply was not valid JSON. Try again.', { text: r.text });
    return v;
  };
  sample.limits = async () => ({ images: true });

  /* ---------- Supabase cloud sync (optional) ---------- */
  const Sync = (() => {
    let timer = null, busy = false, again = false;
    const state = { status: 'off', last: cfg.get('sync.last', 0), error: '' };
    const sb = () => ({ url: (cfg.get('sb.url', '') || CONF.supabaseUrl || '').replace(/\/+$/, ''), key: cfg.get('sb.key', '') || CONF.supabaseAnonKey || '' });
    const session = () => cfg.get('sb.session', null);
    const configured = () => !!(sb().url && sb().key);
    const signedIn = () => !!(session() && session().refresh_token);
    const set = (s, e = '') => { state.status = s; state.error = e; emit('sync', Object.assign({}, state)); };
    async function auth(path, body) {
      const { url, key } = sb();
      const res = await fetch(url + '/auth/v1/' + path, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const t = await res.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
      if (!res.ok) throw err('auth', j.msg || j.error_description || j.message || ('Sign-in failed (' + res.status + ')'));
      return j;
    }
    function saveSession(j) {
      if (!j || !j.access_token) return;
      const prev = session() || {};
      cfg.set('sb.session', { access_token: j.access_token, refresh_token: j.refresh_token || prev.refresh_token, expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (Number(j.expires_in) || 3600) * 1000, user: j.user ? { id: j.user.id, email: j.user.email } : prev.user });
    }
    async function token() {
      const s = session(); if (!s) throw err('signed_out', 'Not signed in');
      if (s.expires_at - Date.now() > 60000) return s.access_token;
      saveSession(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
      return session().access_token;
    }
    async function rest(path, opts = {}) {
      const { url, key } = sb();
      const res = await fetch(url + '/rest/v1/' + path, Object.assign({}, opts, { headers: Object.assign({ apikey: key, authorization: 'Bearer ' + (await token()), 'content-type': 'application/json' }, opts.headers || {}) }));
      if (res.status === 401) { cfg.set('sb.session', Object.assign({}, session(), { expires_at: 0 })); }
      if (!res.ok) { const t = await res.text(); throw err('sync', /relation .*lg_docs.* does not exist|Could not find the table/i.test(t) ? 'The lg_docs table is missing. Run supabase/schema.sql in your Supabase SQL editor.' : 'Sync failed (' + res.status + '): ' + t.slice(0, 200)); }
      return res;
    }
    async function run() {
      if (!configured() || !signedIn()) { set(configured() ? 'signed_out' : 'off'); return; }
      if (navigator.onLine === false) { set('offline'); return; }
      if (busy) { again = true; return; } busy = true; set('syncing');
      try {
        await store.ready;
        const uid = session().user && session().user.id;
        // push
        const dirty = store.dirty();
        for (let i = 0; i < dirty.length; i += 200) {
          const chunk = dirty.slice(i, i + 200);
          await rest('lg_docs?on_conflict=user_id,path', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk.map((r) => ({ user_id: uid, path: r.path, col: r.col, data: r.data, updated: r.updated, deleted: r.deleted }))) });
          store.markClean(chunk);
        }
        // pull
        let cursor = cfg.get('sync.cursor.' + uid, '1970-01-01T00:00:00Z');
        for (let page = 0; page < 50; page++) {
          const res = await rest('lg_docs?select=path,data,updated,deleted,server_ts&server_ts=gt.' + encodeURIComponent(cursor) + '&order=server_ts.asc&limit=1000');
          const rows = await res.json(); if (!rows.length) break;
          for (const r of rows) store.applyRemote(r);
          cursor = rows[rows.length - 1].server_ts; cfg.set('sync.cursor.' + uid, cursor);
          if (rows.length < 1000) break;
        }
        state.last = Date.now(); cfg.set('sync.last', state.last); set('ok');
      } catch (e) { console.warn('sync', e); set(e.code === 'signed_out' ? 'signed_out' : 'error', e.message); }
      finally { busy = false; if (again) { again = false; soon(800); } }
    }
    function soon(ms = 3000) { clearTimeout(timer); timer = setTimeout(run, ms); }
    async function handleRedirect() {
      const h = new URLSearchParams(location.hash.replace(/^#/, ''));
      if (!h.get('access_token') || !configured()) return;
      saveSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: h.get('expires_in') });
      try { const { url, key } = sb(); const u = await (await fetch(url + '/auth/v1/user', { headers: { apikey: key, authorization: 'Bearer ' + h.get('access_token') } })).json(); const s = session(); s.user = { id: u.id, email: u.email }; cfg.set('sb.session', s); } catch (e) {}
      history.replaceState(null, '', location.pathname + location.search);
      soon(100);
    }
    return {
      state, configured, signedIn, run, soon, session, handleRedirect,
      setProject(url, key) { cfg.set('sb.url', String(url || '').trim()); cfg.set('sb.key', String(key || '').trim()); set(configured() ? (signedIn() ? 'ok' : 'signed_out') : 'off'); },
      project: sb,
      async sendCode(email) { await auth('otp', { email, create_user: true, options: { emailRedirectTo: location.origin + location.pathname } }); cfg.set('sb.email', email); },
      async verify(email, code) { const j = await auth('verify', { type: 'email', email, token: String(code).trim() }); saveSession(j); soon(50); },
      signOut() { cfg.set('sb.session', null); set('signed_out'); },
    };
  })();
  setInterval(() => Sync.soon(10), 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.soon(200); });
  window.addEventListener('online', () => Sync.soon(200));
  window.addEventListener('offline', () => Sync.state.status !== 'off' && emit('sync', Object.assign({}, Sync.state, { status: 'offline' })));

  /* ---------- GitHub: feature builds + cloud job ---------- */
  const GH = (() => {
    const repo = () => cfg.get('gh.repo', '') || CONF.repo;
    const tok = () => cfg.get('gh.token', '');
    async function api(path, opts = {}) {
      const h = { accept: 'application/vnd.github+json' }; if (tok()) h.authorization = 'Bearer ' + tok();
      const res = await fetch('https://api.github.com' + path, Object.assign({}, opts, { headers: Object.assign(h, opts.headers || {}) }));
      if (!res.ok) { const t = await res.text(); throw err('github', res.status === 401 ? 'GitHub rejected the token. Make a new one in ⚡ App → Builder.' : res.status === 404 && tok() ? 'GitHub token cannot see ' + repo() + '. Give it access to that repo.' : 'GitHub error ' + res.status + ': ' + t.slice(0, 160)); }
      return res.status === 204 ? null : res.json();
    }
    // Same footer as the Expenses app, so the shared workflow reads it the same way.
    const BUILDER = { claude: 'Claude', copilot: 'GitHub Copilot', manual: 'Just save it' };
    const MODEL = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };
    function issueBody(details, o) {
      const b = BUILDER[o.builder] ? o.builder : 'claude', m = MODEL[o.model] ? o.model : 'sonnet', w = o.when === 'scheduled' ? 'Next scheduled run' : 'Ship now';
      const line = 'Builder: ' + BUILDER[b] + (b === 'claude' ? ' · Model: ' + MODEL[m] + ' · When: ' + w : '');
      return [String(details || '').trim() || '(no extra details)', '', '---', line, 'Requested via: ' + (o.source || 'App'), 'Sent from the app'].join('\n');
    }
    async function requestFeature(title, details, o = {}) {
      title = String(title || '').trim().slice(0, 90); if (!title) throw err('empty', 'Give the feature a name.');
      const body = issueBody(details, o);
      if (!tok()) {
        const u = 'https://github.com/' + repo() + '/issues/new?title=' + encodeURIComponent('Feature: ' + title) + '&body=' + encodeURIComponent(body);
        window.open(u, '_blank', 'noopener');
        return { url: u, number: null, opened: true };
      }
      const j = await api('/repos/' + repo() + '/issues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Feature: ' + title, body }) });
      emit('builds');
      return { url: j.html_url, number: j.number };
    }
    async function builds() {
      const list = await api('/repos/' + repo() + '/issues?labels=feature-request&state=all&per_page=15&sort=created&direction=desc');
      return (list || []).filter((i) => !i.pull_request).map((i) => {
        const L = (i.labels || []).map((l) => l.name);
        const status = L.includes('shipped') ? 'shipped' : L.includes('needs-human') ? 'needs help' : L.includes('building') ? 'building' : L.includes('queued') ? 'queued' : i.state === 'closed' ? 'closed' : 'waiting';
        return { number: i.number, title: String(i.title).replace(/^Feature:\s*/, ''), status, url: i.html_url, created: i.created_at, updated: i.updated_at };
      });
    }
    async function runJob(kind) {
      if (!tok()) { window.open('https://github.com/' + repo() + '/actions/workflows/cloud-job.yml', '_blank', 'noopener'); return false; }
      await api('/repos/' + repo() + '/actions/workflows/cloud-job.yml/dispatches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: CONF.branch, inputs: { kind: kind || 'daily' } }) });
      return true;
    }
    return { repo, hasToken: () => !!tok(), setToken: (t) => cfg.set('gh.token', String(t || '').trim() || null), requestFeature, builds, runJob };
  })();

  /* ---------- window.claude shim ---------- */
  const caps = {
    db: store.db,
    sample,
    downloads: { async save({ filename, data, mimeType }) { const b = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename || 'download'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } },
    mcp: {
      async callTool(server, tool, args) {
        if (tool !== 'fire_trigger') throw err('unsupported', 'Tool not available in the app: ' + tool);
        const refresh = store.get('meta/refresh') || {};
        const kind = args && args.trigger_id && args.trigger_id === refresh.courseTriggerId ? 'courses' : 'daily';
        const ok = await GH.runJob(kind); if (!ok) throw err('no_token', 'Add a GitHub token in ⚡ App → Builder to start cloud jobs from the app.');
        return { ok: true };
      },
    },
    permissions: { async state() { return 'granted'; }, async manage() { window.LG && window.LG.openPanel && window.LG.openPanel('ai'); } },
  };
  window.claude = { use: async (name) => { if (name === 'db') await store.ready; return caps[name] || null; } };

  /* make sure the app's "cloud job" buttons are enabled: it checks meta/refresh for trigger ids */
  store.ready.then(() => { const r = store.get('meta/refresh'); if (!r || !r.triggerId || !r.courseTriggerId) store.db.doc('meta/refresh').set(Object.assign({}, r || {}, { triggerId: (r && r.triggerId) || 'gh-daily', courseTriggerId: (r && r.courseTriggerId) || 'gh-courses' })); });

  window.LG = Object.assign(window.LG || {}, { cfg, bus, store, Sync, GH, PROVIDERS, aiCfg, setAi: (o) => cfg.set('ai', Object.assign({}, cfg.get('ai', {}), o)), sample, requestFeature: (...a) => GH.requestFeature(...a), version: window.LG_VERSION || 'dev' });

  Sync.handleRedirect().finally(() => Sync.soon(400));
})();
