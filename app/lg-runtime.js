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
  // Inside a claude.ai artifact the platform provides the real window.claude (db, sample, downloads, ...).
  // Then this file must not replace it: data lives in the artifact database and Jarvis runs on the viewer's Claude account.
  const NATIVE = (window.claude && typeof window.claude.use === 'function') ? window.claude : null;
  const ARTIFACT = !!NATIVE;
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
  /* Artifact store: mirrors the artifact database into memory (counts, export, imports); db calls pass straight through. */
  const LG_COLS = ['meta', 'plans', 'courses', 'topics', 'paths', 'tasks', 'done', 'research', 'news', 'problems', 'categories', 'tracks', 'jarvis', 'sessions', 'trends', 'usage'];
  function artifactStore() {
    const docs = new Map(), hooks = new Set(); let realDb = null, done;
    const ready = new Promise((res) => (done = res));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      try { realDb = await NATIVE.use('db'); } catch (e) { realDb = null; }
      if (!realDb) { done(); return; }
      let left = LG_COLS.length; const one = () => { if (--left === 0) done(); };
      for (const c of LG_COLS) {
        let first = true;
        realDb.collection(c).onSnapshot((snap) => {
          for (const k of [...docs.keys()]) if (k.startsWith(c + '/')) docs.delete(k);
          for (const d of snap.docs) docs.set(c + '/' + d.id, d.data());
          if (first) { first = false; one(); }
          for (const h of hooks) { try { h(new Set([c])); } catch (e) {} }
        }, () => { if (first) { first = false; one(); } });
      }
      setTimeout(done, 6000);
    })();
    return {
      ready, flush: async () => {},
      get db() { return realDb; },
      onChange(fn) { hooks.add(fn); return () => hooks.delete(fn); },
      dirty: () => [], markClean() {},
      count: () => docs.size,
      get: (p) => { const d = docs.get(p); return d ? JSON.parse(JSON.stringify(d)) : undefined; },
      exportAll() { const out = {}; for (const [p, d] of docs) { const i = p.indexOf('/'); (out[p.slice(0, i)] = out[p.slice(0, i)] || {})[p.slice(i + 1)] = d; } return JSON.parse(JSON.stringify(out)); },
      // the public daily feed: only write items that are not stored yet
      applyRemote(r) { if (!realDb || docs.has(r.path) || r.deleted) return false; docs.set(r.path, r.data); realDb.doc(r.path).set(r.data).catch(() => {}); return true; },
      async importAll(obj, onProgress) {
        await ready; if (!realDb) throw err('no_db', 'The artifact database is not available here.');
        const jobs = [];
        for (const [col, byId] of Object.entries(obj || {})) {
          if (!byId || typeof byId !== 'object' || !/^[A-Za-z0-9_.~:@+-]+$/.test(col)) continue;
          for (const [id, data] of Object.entries(byId)) if (data && typeof data === 'object' && /^[A-Za-z0-9_.~:@+-]{1,200}$/.test(id)) { const { id: _x, ...rest } = data; jobs.push([col + '/' + id, rest]); }
        }
        let n = 0, i = 0;
        const lanes = Array.from({ length: 4 }, async () => {
          for (;;) {
            const j = jobs[i++]; if (!j) return;
            for (let t = 0; t < 6; t++) {
              try { await realDb.doc(j[0]).set(j[1]); n++; break; }
              catch (e) { if (e && (e.code === 'resource_exhausted' || e.code === 'unavailable') && t < 5) await sleep(600 * (t + 1)); else if (e && e.code === 'quota_exceeded') throw e; else break; }
            }
            if (onProgress && n % 25 === 0) onProgress(n, jobs.length);
          }
        });
        await Promise.all(lanes); return n;
      },
    };
  }
  const store = ARTIFACT ? artifactStore() : window.LGStore.createStore({ name: 'learning-galaxy' });
  store.onChange(() => { emit('data'); Sync.soon(); });

  /* ---------- AI: any provider (same list as the Expenses app) ---------- */
  // protocol: openai (chat/completions, used by most), anthropic (messages), gemini (generateContent).
  // models: quick / default / complex = eco, normal, deep think. All user-editable; ids change over time.
  const PROVIDERS = {
    anthropic: { label: 'Claude (Anthropic)', group: 'paid', protocol: 'anthropic', base: 'https://api.anthropic.com/v1', models: { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' }, keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Paid. Best results for Jarvis.' },
    gemini: { label: 'Google Gemini', group: 'free', protocol: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', models: { quick: 'gemini-2.5-flash-lite', default: 'gemini-2.5-flash', complex: 'gemini-2.5-pro' }, keyUrl: 'https://aistudio.google.com/apikey', note: 'Free tier available.' },
    groq: { label: 'Groq', group: 'free', protocol: 'openai', base: 'https://api.groq.com/openai/v1', models: { quick: 'llama-3.1-8b-instant', default: 'llama-3.3-70b-versatile', complex: 'llama-3.3-70b-versatile' }, keyUrl: 'https://console.groq.com/keys', note: 'Free tier, very fast.' },
    openrouter: { label: 'OpenRouter', group: 'free', protocol: 'openai', base: 'https://openrouter.ai/api/v1', models: { quick: 'meta-llama/llama-3.1-8b-instruct:free', default: 'meta-llama/llama-3.3-70b-instruct:free', complex: 'meta-llama/llama-3.3-70b-instruct:free' }, keyUrl: 'https://openrouter.ai/keys', note: 'Hundreds of models, many free.' },
    cerebras: { label: 'Cerebras', group: 'free', protocol: 'openai', base: 'https://api.cerebras.ai/v1', models: { quick: 'llama3.1-8b', default: 'llama-3.3-70b', complex: 'llama-3.3-70b' }, keyUrl: 'https://cloud.cerebras.ai/', note: 'Free tier available.' },
    huggingface: { label: 'Hugging Face', group: 'free', protocol: 'openai', base: 'https://router.huggingface.co/v1', models: { quick: 'meta-llama/Llama-3.1-8B-Instruct', default: 'meta-llama/Llama-3.3-70B-Instruct', complex: 'meta-llama/Llama-3.3-70B-Instruct' }, keyUrl: 'https://huggingface.co/settings/tokens', note: 'Free monthly credits. Token starts with hf_.' },
    sambanova: { label: 'SambaNova', group: 'free', protocol: 'openai', base: 'https://api.sambanova.ai/v1', models: { quick: 'Meta-Llama-3.1-8B-Instruct', default: 'Meta-Llama-3.3-70B-Instruct', complex: 'Meta-Llama-3.3-70B-Instruct' }, keyUrl: 'https://cloud.sambanova.ai/apis', note: 'Free tier available.' },
    openai: { label: 'OpenAI', group: 'paid', protocol: 'openai', base: 'https://api.openai.com/v1', models: { quick: 'gpt-4o-mini', default: 'gpt-4o', complex: 'gpt-4o' }, keyUrl: 'https://platform.openai.com/api-keys', note: 'Paid.' },
    deepseek: { label: 'DeepSeek', group: 'paid', protocol: 'openai', base: 'https://api.deepseek.com/v1', models: { quick: 'deepseek-chat', default: 'deepseek-chat', complex: 'deepseek-reasoner' }, keyUrl: 'https://platform.deepseek.com/api_keys', note: 'Paid, very cheap.' },
    mistral: { label: 'Mistral', group: 'paid', protocol: 'openai', base: 'https://api.mistral.ai/v1', models: { quick: 'mistral-small-latest', default: 'mistral-medium-latest', complex: 'mistral-large-latest' }, keyUrl: 'https://console.mistral.ai/api-keys', note: 'Paid, free experiment tier.' },
    xai: { label: 'xAI (Grok)', group: 'paid', protocol: 'openai', base: 'https://api.x.ai/v1', models: { quick: 'grok-3-mini', default: 'grok-3-mini', complex: 'grok-3' }, keyUrl: 'https://console.x.ai/', note: 'Paid.' },
    together: { label: 'Together AI', group: 'paid', protocol: 'openai', base: 'https://api.together.xyz/v1', models: { quick: 'meta-llama/Llama-3.2-3B-Instruct-Turbo', default: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', complex: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' }, keyUrl: 'https://api.together.ai/settings/api-keys', note: 'Paid.' },
    perplexity: { label: 'Perplexity', group: 'paid', protocol: 'openai', base: 'https://api.perplexity.ai', models: { quick: 'sonar', default: 'sonar', complex: 'sonar-pro' }, keyUrl: 'https://www.perplexity.ai/settings/api', note: 'Paid. Answers with web search.' },
    fireworks: { label: 'Fireworks AI', group: 'paid', protocol: 'openai', base: 'https://api.fireworks.ai/inference/v1', models: { quick: 'accounts/fireworks/models/llama-v3p1-8b-instruct', default: 'accounts/fireworks/models/llama-v3p3-70b-instruct', complex: 'accounts/fireworks/models/llama-v3p3-70b-instruct' }, keyUrl: 'https://fireworks.ai/account/api-keys', note: 'Paid.' },
    novita: { label: 'Novita AI', group: 'paid', protocol: 'openai', base: 'https://api.novita.ai/v3/openai', models: { quick: 'meta-llama/llama-3.1-8b-instruct', default: 'meta-llama/llama-3.3-70b-instruct', complex: 'meta-llama/llama-3.3-70b-instruct' }, keyUrl: 'https://novita.ai/settings/key-management', note: 'Paid.' },
    cohere: { label: 'Cohere', group: 'paid', protocol: 'openai', base: 'https://api.cohere.ai/compatibility/v1', models: { quick: 'command-r', default: 'command-r-plus', complex: 'command-r-plus' }, keyUrl: 'https://dashboard.cohere.com/api-keys', note: 'Free trial key available.' },
    azure: { label: 'Azure OpenAI', group: 'paid', protocol: 'openai', base: '', models: { quick: 'gpt-4o-mini', default: 'gpt-4o-mini', complex: 'gpt-4o-mini' }, keyUrl: 'https://portal.azure.com/', note: 'Endpoint: https://<resource>.openai.azure.com/openai/deployments/<deployment>', adv: { auth: 'header', authName: 'api-key', query: 'api-version=2024-10-21' } },
    lmstudio: { label: 'LM Studio (local)', group: 'local', protocol: 'openai', base: 'http://localhost:1234/v1', models: { quick: 'local-model', default: 'local-model', complex: 'local-model' }, keyUrl: 'https://lmstudio.ai/', note: 'Runs on your PC. No key needed.', noKey: true },
    ollama: { label: 'Ollama (local)', group: 'local', protocol: 'openai', base: 'http://localhost:11434/v1', models: { quick: 'llama3.2', default: 'llama3.2', complex: 'llama3.2' }, keyUrl: 'https://ollama.com/download', note: 'Runs on your PC. No key needed.', noKey: true },
    custom: { label: 'Custom (any API)', group: 'local', protocol: 'openai', base: '', models: { quick: '', default: '', complex: '' }, keyUrl: '', note: 'Any API: set protocol, endpoint and auth under Advanced.' },
  };
  const GROUPS = { free: 'Free tier', paid: 'Paid', local: 'Local & custom' };
  // key prefix → provider (longest first). sk- is shared by several, so it is only a guess.
  const PREFIXES = [['sk-ant-', 'anthropic'], ['sk-or-', 'openrouter'], ['AIza', 'gemini'], ['gsk_', 'groq'], ['xai-', 'xai'], ['csk-', 'cerebras'], ['hf_', 'huggingface'], ['pplx-', 'perplexity'], ['sk-proj-', 'openai'], ['sk-', 'openai']];
  const detectProvider = (key) => { const k = String(key || '').trim(); for (const [p, id] of PREFIXES) if (k.startsWith(p)) return id; return null; };
  const PATHS = { openai: '/chat/completions', anthropic: '/messages', gemini: '/models/{model}:generateContent' };

  // prefixes owned by exactly one provider: such a key wins over a mismatched provider choice
  const SURE = new Set(['anthropic', 'openrouter', 'gemini', 'groq', 'xai', 'cerebras', 'huggingface', 'perplexity']);
  function aiCfg() {
    const c = cfg.get('ai', {}) || {};
    const key = String(c.key || '').trim().replace(/^Bearer\s+/i, '');
    const det = detectProvider(key);
    let id = PROVIDERS[c.provider] ? c.provider : (det || 'anthropic');
    if (det && SURE.has(det) && id !== det && id !== 'custom' && PROVIDERS[id].group !== 'local') id = det; // e.g. a gsk_ key while "Claude" is selected → Groq
    const P = PROVIDERS[id]; const switched = !!c.provider && id !== c.provider;
    const mine = (k) => (switched ? '' : c[k]); // settings typed for another provider don't carry over
    const adv = Object.assign({}, P.adv || {}, switched ? {} : (c.adv || {}));
    const protocol = (id === 'custom' && adv.protocol) || P.protocol;
    const def = mine('default') || P.models.default;
    return { provider: id, label: P.label, protocol, key, noKey: !!P.noKey, base: (mine('base') || P.base || '').replace(/\/+$/, ''), adv,
      models: { quick: mine('quick') || P.models.quick || def, default: def, complex: mine('complex') || P.models.complex || def } };
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
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('data:')) { const d = line.slice(5).trim(); if (d && d !== '[DONE]') { try { onData(JSON.parse(d)); } catch (e) { if (e && e.code) throw e; } } } }
    }
  }
  function httpErr(status, body, label) {
    const msg = (() => { try { const j = JSON.parse(body); const e = Array.isArray(j) ? j[0] && j[0].error : j.error; return (e && (e.message || e)) || j.message || body; } catch (e) { return body; } })();
    if (/^(forbidden|host not allowed|https only|bad url)$/i.test(String(msg))) return err('relay', 'The app relay refused the request (' + msg + '). Open the app from its main address and try again.');
    if (status === 401 || status === 403) return err('bad_key', label + ' said: “' + String(msg).slice(0, 160) + '” (' + status + '). Check the key in ⚡ App → AI brain, and that it is a ' + label + ' key.');
    if (status === 404) return err('bad_model', label + ' could not find that model or endpoint (404): ' + String(msg).slice(0, 160) + '. Check the model name in ⚡ App → AI brain.');
    if (status === 429) return err('rate_limited', label + ' is rate limiting you. Wait a minute and try again.');
    if (status === 400 && /image/i.test(String(msg))) return err('image_rejected', 'This model could not read that image. Try a model with vision.');
    return err('ai_error', label + ' request failed (' + status + '): ' + String(msg).slice(0, 240));
  }
  // Build the request for any protocol.
  function buildRequest(c, model, msgs, images, maxTokens, stream) {
    const headers = { 'content-type': 'application/json' }; let url = c.base, body;
    const path = (c.adv.path || PATHS[c.protocol]).replace('{model}', encodeURIComponent(model));
    if (c.protocol === 'anthropic') {
      if (images.length) { const last = msgs[msgs.length - 1]; last.content = [...images.map((u) => { const m = /^data:([^;]+);base64,(.*)$/.exec(u) || []; return { type: 'image', source: { type: 'base64', media_type: m[1] || 'image/jpeg', data: m[2] || '' } }; }), { type: 'text', text: String(last.content) }]; }
      headers['anthropic-version'] = '2023-06-01'; headers['anthropic-dangerous-direct-browser-access'] = 'true';
      body = { model, max_tokens: maxTokens, messages: msgs, stream };
      url += path;
    } else if (c.protocol === 'gemini') {
      const contents = msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
      if (images.length) contents[contents.length - 1].parts.unshift(...images.map((u) => { const m = /^data:([^;]+);base64,(.*)$/.exec(u) || []; return { inline_data: { mime_type: m[1] || 'image/jpeg', data: m[2] || '' } }; }));
      body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
      url += stream ? path.replace(':generateContent', ':streamGenerateContent') + '?alt=sse' : path;
    } else {
      if (images.length) { const last = msgs[msgs.length - 1]; last.content = [{ type: 'text', text: String(last.content) }, ...images.map((u) => ({ type: 'image_url', image_url: { url: u } }))]; }
      body = { model, messages: msgs, stream, max_tokens: maxTokens };
      url += path;
    }
    // auth
    const auth = c.adv.auth || (c.protocol === 'openai' ? 'bearer' : 'header');
    const authName = c.adv.authName || (c.protocol === 'anthropic' ? 'x-api-key' : c.protocol === 'gemini' ? 'x-goog-api-key' : 'authorization');
    if (c.key && auth === 'bearer') headers.authorization = 'Bearer ' + c.key;
    else if (c.key && auth === 'header') headers[authName] = c.key;
    let q = c.adv.query || ''; if (c.key && auth === 'query') q = (q ? q + '&' : '') + encodeURIComponent(authName || 'key') + '=' + encodeURIComponent(c.key);
    if (q) url += (url.includes('?') ? '&' : '?') + q;
    for (const line of String(c.adv.headers || '').split('\n')) { const i = line.indexOf(':'); if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    return { url, headers, body };
  }
  const textOf = (protocol, j) => protocol === 'anthropic' ? (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
    : protocol === 'gemini' ? ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('')
    : ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
  const deltaOf = (protocol, ev) => protocol === 'anthropic' ? (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta' ? ev.delta.text : (ev.type === 'error' ? (() => { throw err('ai_error', (ev.error && ev.error.message) || 'AI stream error'); })() : ''))
    : protocol === 'gemini' ? textOf('gemini', ev)
    : ((ev.choices && ev.choices[0] && ev.choices[0].delta && ev.choices[0].delta.content) || '');
  const isLocal = (u) => /^https?:\/\/(localhost|127\.|\[::1\]|192\.168\.|10\.)/i.test(u);
  // Some providers block calls from browsers (CORS). Then we relay through this app's own Netlify function.
  async function viaProxy(req, signal) {
    const res = await fetch((window.LG_PROXY || '/api/ai-proxy'), { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: req.url, method: 'POST', headers: req.headers, body: JSON.stringify(req.body) }) });
    if (res.status === 404 && !res.headers.get('x-proxy-upstream')) throw err('network', 'Could not reach the AI provider, and the relay is not available here.');
    return res;
  }

  async function sample(input, opts = {}) {
    const c = aiCfg();
    if (!c.key && !c.noKey) { if (Date.now() - (sample._nag || 0) > 20000) { sample._nag = Date.now(); setTimeout(() => window.LG && window.LG.openPanel && window.LG.openPanel('ai'), 400); } }
    if (!c.key && !c.noKey) throw err('no_key', 'I need an AI key to think. Tap **⚡ App** → **AI brain**, paste a key from any provider (Groq and Gemini have free tiers), then ask me again.');
    const tier = ['quick', 'default', 'complex'].includes(opts.modelTier) ? opts.modelTier : 'default';
    const model = c.models[tier];
    if (!model) throw err('no_model', 'Type a model name for ' + c.label + ' in ⚡ App → AI brain.');
    if (!c.base) throw err('no_base', 'Set the endpoint URL for ' + c.label + ' in ⚡ App → AI brain.');
    const msgs = normMsgs(input); if (!msgs.length) throw err('empty', 'Nothing to send.');
    const images = await Promise.all((opts.images || []).slice(0, 4).map(async (f) => (typeof f === 'string' ? f : await fileToB64(f))));
    const proxied = !!(cfg.get('ai.proxy', {}) || {})[c.provider] && !isLocal(c.base);
    const stream = typeof opts.onText === 'function' && !proxied;
    const maxTokens = opts.maxTokens || (tier === 'complex' ? 16000 : 8000);
    const req = buildRequest(c, model, msgs, images, maxTokens, stream);
    let text = '';
    const tick = (t) => { if (!t) return; text += t; if (stream) { try { opts.onText({ text, delta: t }); } catch (e) {} } };
    try {
      let res;
      if (proxied) res = await viaProxy(req, opts.signal);
      else {
        try { res = await fetch(req.url, { method: 'POST', signal: opts.signal, headers: req.headers, body: JSON.stringify(req.body) }); }
        catch (e) {
          if (e && e.name === 'AbortError') throw e;
          if (navigator.onLine === false || isLocal(c.base)) throw e;
          // likely blocked by CORS: remember and retry through the relay (no streaming)
          cfg.set('ai.proxy', Object.assign({}, cfg.get('ai.proxy', {}) || {}, { [c.provider]: true }));
          const req2 = buildRequest(c, model, normMsgs(input), images, maxTokens, false);
          res = await viaProxy(req2, opts.signal);
          if (!res.ok) throw httpErr(res.status, await res.text(), c.label);
          text = textOf(c.protocol, await res.json()); if (typeof opts.onText === 'function') try { opts.onText({ text, delta: text }); } catch (x) {}
          return { text, route: 'proxy' };
        }
      }
      if (!res.ok) throw httpErr(res.status, await res.text(), c.label);
      if (stream) await readSSE(res, (ev) => tick(deltaOf(c.protocol, ev)));
      else { text = textOf(c.protocol, await res.json()); if (proxied && typeof opts.onText === 'function') try { opts.onText({ text, delta: text }); } catch (x) {} }
    } catch (e) {
      if (e && (e.name === 'AbortError' || (opts.signal && opts.signal.aborted))) throw err('cancelled', '', { text });
      if (e && e.code) { if (text && !e.partial) e.partial = text; throw e; }
      throw err('network', navigator.onLine === false ? 'You are offline. Connect to the internet and try again.' : isLocal(c.base) ? 'Could not reach ' + c.label + ' at ' + c.base + '. Is it running, with CORS allowed?' : 'Could not reach ' + c.label + ' (' + (e && e.message) + ').');
    }
    return { text, route: proxied ? 'proxy' : 'direct' };
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
    if (v === undefined) throw err('bad_json', 'The AI reply was not valid JSON. Try again (or pick a stronger model).', { text: r.text });
    return v;
  };
  sample.limits = async () => ({ images: true });

  /* ---------- Supabase cloud sync (optional) ---------- */
  const Sync = (() => {
    let timer = null, busy = false, again = false;
    const state = { status: 'off', last: cfg.get('sync.last', 0), error: '' };
    const sb = () => ({ url: (cfg.get('sb.url', '') || CONF.supabaseUrl || '').replace(/\/+$/, ''), key: cfg.get('sb.key', '') || CONF.supabaseAnonKey || '' });
    const session = () => cfg.get('sb.session', null);
    const configured = () => !ARTIFACT && !!(sb().url && sb().key);
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
    // run(): one sync pass at a time; a request made during a pass queues one more pass, and every caller
    // gets a promise that settles only when all queued passes are done.
    let inflight = null;
    function run() {
      if (!configured() || !signedIn()) { set(configured() ? 'signed_out' : 'off'); return Promise.resolve(); }
      if (navigator.onLine === false) { set('offline'); return Promise.resolve(); }
      if (inflight) { again = true; return inflight; }
      inflight = (async () => { do { again = false; await once(); } while (again); })().finally(() => { inflight = null; });
      return inflight;
    }
    async function once() {
      busy = true; set('syncing');
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
      finally { busy = false; }
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
      if (ARTIFACT) { const url = 'https://github.com/' + repo() + '/issues/new?title=' + encodeURIComponent('Feature: ' + title) + '&body=' + encodeURIComponent(body); emit('feature-link', { url, title }); return { url, number: null, link: true }; }
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
  if (!ARTIFACT) window.claude = { use: async (name) => { if (name === 'db') await store.ready; return caps[name] || null; } };

  /* make sure the app's "cloud job" buttons are enabled: it checks meta/refresh for trigger ids */
  if (!ARTIFACT) store.ready.then(() => { const r = store.get('meta/refresh'); if (!r || !r.triggerId || !r.courseTriggerId) store.db.doc('meta/refresh').set(Object.assign({}, r || {}, { triggerId: (r && r.triggerId) || 'gh-daily', courseTriggerId: (r && r.courseTriggerId) || 'gh-courses' })); });

  /* ---------- public daily feed (news, trending, tools, videos) ----------
   * feed/latest.json is published with the app (it is not personal). Every device merges it into its
   * local news/trends collections, so the Radar is fresh even without signing in. Items are applied as
   * "remote" records (not uploaded to your sync database). */
  async function loadFeed() {
    try {
      const res = await fetch('feed/latest.json', { cache: 'no-cache' }); if (!res.ok) return;
      const f = await res.json(); await store.ready;
      const at = Date.parse(f.generated || f.date) || Date.now(); let n = 0;
      for (const it of [...(f.news || []), ...(f.tools || []), ...(f.videos || [])]) {
        if (!it || !it.id || !it.title || !/^https?:/.test(it.url || '')) continue;
        if (store.applyRemote({ path: 'news/' + it.id, data: Object.assign({ date: f.date, added: f.date }, it), updated: at, deleted: false })) n++;
      }
      if (f.trends && f.date) store.applyRemote({ path: 'trends/' + f.date, data: Object.assign({ date: f.date, updated: f.generated || f.date }, f.trends), updated: at, deleted: false });
      if (n) emit('feed', { n, date: f.date });
    } catch (e) { console.warn('feed', e); }
  }
  loadFeed(); setInterval(loadFeed, 3 * 3600e3);

  window.LG = Object.assign(window.LG || {}, { ARTIFACT, NATIVE, cfg, bus, store, loadFeed, Sync, GH, PROVIDERS, GROUPS, detectProvider, aiCfg, setAi: (o) => cfg.set('ai', Object.assign({}, cfg.get('ai', {}), o)), sample, requestFeature: (...a) => GH.requestFeature(...a), version: window.LG_VERSION || 'dev' });

  Sync.handleRedirect().finally(() => Sync.soon(400));
})();
