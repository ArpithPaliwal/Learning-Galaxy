// Learning Galaxy bot — runs on a schedule in GitHub Actions (or anywhere with Node 20+).
// It reads your Learning Galaxy data from a private GitHub Gist, adds fresh news,
// imports pending paths, writes the morning digest and the Sunday weekly report,
// and pushes a phone notification through ntfy.sh. Works with any LLM provider.
// No npm dependencies.

const env = process.env;
const FILE = 'learning-galaxy.json';
const TZ = env.TIMEZONE || 'Asia/Kolkata';
const UA = {'user-agent': 'learning-galaxy-bot'};

/* ---------------- small helpers ---------------- */
const log = (...a) => console.log('[galaxy]', ...a);
const dateIn = (d = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(d);
const weekday = (d = new Date()) => new Intl.DateTimeFormat('en-US', {timeZone: TZ, weekday: 'short'}).format(d);
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
const mondayOf = s => { const [y, m, d] = s.split('-').map(Number); const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; return addDays(s, -wd); };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56) || 'item';
const nowIso = () => new Date().toISOString();
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
async function getJSON(url, opts = {}) { const r = await fetch(url, {...opts, headers: {...UA, ...(opts.headers || {})}}); if (!r.ok) throw new Error(`${url} → ${r.status}`); return r.json(); }
async function getText(url, opts = {}) { const r = await fetch(url, {...opts, headers: {...UA, ...(opts.headers || {})}}); if (!r.ok) throw new Error(`${url} → ${r.status}`); return r.text(); }
const safe = async (label, fn, fallback) => { try { return await fn(); } catch (e) { log(`skip ${label}: ${e.message}`); return fallback; } };

/* ---------------- gist storage ---------------- */
const gh = (path, opts = {}) => getJSON('https://api.github.com' + path, {...opts, headers: {authorization: 'Bearer ' + env.GIST_TOKEN, accept: 'application/vnd.github+json', 'content-type': 'application/json', ...(opts.headers || {})}});
let GIST_FILES = {};
async function gistFile(name) { const f = GIST_FILES[name]; if (!f) return ''; return f.truncated && f.raw_url ? getText(f.raw_url) : f.content; }
async function loadGist() {
  const g = await gh('/gists/' + env.GIST_ID); GIST_FILES = g.files || {};
  const f = g.files && g.files[FILE];
  if (!f) return {app: 'learning-galaxy', version: 2, data: {}};
  const content = f.truncated && f.raw_url ? await getText(f.raw_url) : f.content;
  return JSON.parse(content);
}
async function saveGist(obj) {
  obj.exported = nowIso();
  await gh('/gists/' + env.GIST_ID, {method: 'PATCH', body: JSON.stringify({files: {[FILE]: {content: JSON.stringify(obj)}}})});
}

/* ---------------- any-LLM client ---------------- */
const PROVIDERS = {
  openai: {base: 'https://api.openai.com/v1', model: 'gpt-4o-mini'},
  anthropic: {base: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5'},
  gemini: {base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash'},
  openrouter: {base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini'},
  groq: {base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile'},
  custom: {base: '', model: ''}
};
async function llm(prompt, {system = '', json = false, max = 3000} = {}) {
  const prov = (env.LLM_PROVIDER || 'openai').toLowerCase(); const p = PROVIDERS[prov] || PROVIDERS.custom;
  const base = (env.LLM_BASE_URL || p.base).replace(/\/$/, ''); const model = env.LLM_MODEL || p.model;
  if (!base || !model) throw new Error('Set LLM_PROVIDER / LLM_MODEL (and LLM_BASE_URL for custom).');
  const sys = (system ? system + '\n' : '') + (json ? 'Reply with only valid JSON. No prose, no code fences.' : '');
  let text = '';
  if (prov === 'anthropic') {
    const r = await getJSON(base + '/messages', {method: 'POST', headers: {'content-type': 'application/json', 'x-api-key': env.LLM_API_KEY, 'anthropic-version': '2023-06-01'},
      body: JSON.stringify({model, max_tokens: max, system: sys || undefined, messages: [{role: 'user', content: prompt}]})});
    text = (r.content || []).map(c => c.text || '').join('');
  } else {
    const headers = {'content-type': 'application/json'}; if (env.LLM_API_KEY) headers.authorization = 'Bearer ' + env.LLM_API_KEY;
    const r = await getJSON(base + '/chat/completions', {method: 'POST', headers, body: JSON.stringify({model, max_tokens: max, messages: [...(sys ? [{role: 'system', content: sys}] : []), {role: 'user', content: prompt}]})});
    text = r.choices?.[0]?.message?.content || '';
  }
  if (!json) return text.trim();
  const tries = [text]; const f = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) tries.push(f[1]);
  const a = Math.min(...['{', '['].map(c => { const i = text.indexOf(c); return i < 0 ? Infinity : i; })), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (a < Infinity && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) { try { return JSON.parse(t); } catch (_) {} }
  throw new Error('LLM did not return JSON: ' + text.slice(0, 200));
}

/* ---------------- news sources (free, no keys) ---------------- */
async function fromHN(sinceTs) {
  const qs = ['LLM', 'AI agent', 'RAG', 'open model', 'voice AI', 'system design', 'distributed systems', 'database', 'Postgres', 'Kubernetes'];
  const out = [];
  for (const q of qs) {
    const r = await safe('hn ' + q, () => getJSON(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${sinceTs},points>40&hitsPerPage=12`), {hits: []});
    for (const h of r.hits || []) if (h.url) out.push({source: 'Hacker News', title: h.title, url: h.url, snippet: `${h.points} points · ${h.num_comments} comments`, hint: q});
  }
  return out;
}
async function fromGitHub(sinceDate) {
  const topics = ['llm', 'ai-agents', 'rag', 'mcp', 'voice-assistant', 'llmops', 'system-design', 'distributed-systems'];
  const out = []; const auth = env.GIST_TOKEN ? {authorization: 'Bearer ' + env.GIST_TOKEN} : {};
  for (const t of topics) {
    const r = await safe('github ' + t, () => getJSON(`https://api.github.com/search/repositories?q=topic:${t}+created:>${sinceDate}+stars:>40&sort=stars&order=desc&per_page=6`, {headers: auth}), {items: []});
    for (const it of r.items || []) out.push({source: 'GitHub', title: it.full_name, url: it.html_url, snippet: clip(`${it.description || ''} · ${it.stargazers_count} stars · ${it.language || ''}`, 220), hint: 'repo ' + t});
  }
  return out;
}
async function fromArxiv() {
  const xml = await safe('arxiv', () => getText('https://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.MA&sortBy=submittedDate&sortOrder=descending&max_results=45'), '');
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
    const e = m[1]; const id = (e.match(/<id>([^<]+)<\/id>/) || [])[1] || '';
    return {source: 'arXiv', title: decode((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]), url: id.replace('http://', 'https://').replace(/v\d+$/, ''), snippet: clip(decode((e.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]), 260), hint: 'paper'};
  }).filter(x => x.url);
}
const FEEDS = (env.EXTRA_FEEDS ? env.EXTRA_FEEDS.split(',').map(s => s.trim()).filter(Boolean) : []).concat([
  'https://blog.cloudflare.com/rss/', 'https://netflixtechblog.com/feed', 'https://engineering.fb.com/feed/', 'https://aws.amazon.com/blogs/architecture/feed/',
  'https://blog.bytebytego.com/feed', 'https://martinfowler.com/feed.atom', 'https://huggingface.co/blog/feed.xml', 'https://www.anthropic.com/rss.xml', 'https://openai.com/news/rss.xml'
]);
async function fromFeeds(sinceDate) {
  const out = [];
  for (const url of FEEDS) {
    const xml = await safe('feed ' + url, () => getText(url), ''); if (!xml) continue;
    const host = new URL(url).hostname.replace(/^www\./, '');
    const items = [...xml.matchAll(/<(item|entry)>([\s\S]*?)<\/\1>/g)].slice(0, 8);
    for (const [, , it] of items) {
      const title = decode((it.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
      const link = (it.match(/<link>([^<]+)<\/link>/) || it.match(/<link[^>]*href="([^"]+)"/) || [])[1];
      const when = (it.match(/<(pubDate|published|updated)>([^<]+)<\//) || [])[2];
      const d = when ? new Date(when) : null; if (d && !isNaN(d) && d.toISOString().slice(0, 10) < sinceDate) continue;
      if (title && link) out.push({source: host, title, url: link.trim(), snippet: clip(decode((it.match(/<(description|summary)[^>]*>([\s\S]*?)<\/\1>/) || [])[2]), 220), hint: 'article'});
    }
  }
  return out;
}


/* ---------------- AI Academy: apply suggestions + keep tracks current ---------------- */
const TRUSTED = ['youtube.com','youtu.be','anthropic.com','docs.anthropic.com','docs.claude.com','openai.com','platform.openai.com','cookbook.openai.com','learn.microsoft.com','devblogs.microsoft.com','azure.microsoft.com','huggingface.co','github.com','arxiv.org','modelcontextprotocol.io','deeplearning.ai','pytorch.org','docs.vllm.ai','ollama.com','docs.pipecat.ai','docs.livekit.io','python.langchain.com','langchain-ai.github.io','docs.llamaindex.ai','ai.google.dev','cloud.google.com','aws.amazon.com','docs.unsloth.ai','hamel.dev','promptingguide.ai','developer.nvidia.com','docs.mistral.ai','kaggle.com','fast.ai','datacamp.com'];
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const trusted = (u, extra) => /^https:\/\//.test(u || '') && (extra.has(u) || TRUSTED.some(t => hostOf(u) === t || hostOf(u).endsWith('.' + t)));
function cleanStep(s, extra, today) {
  const links = [];
  for (const q of (s.video_search || []).slice(0, 3)) if (q) links.push({label: 'YouTube: ' + clip(q, 80), url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(clip(q, 120)), by: 'ai'});
  for (const l of (s.links || []).slice(0, 5)) if (l && trusted(String(l.url || ''), extra)) links.push({label: clip(l.label, 120), url: String(l.url), by: 'ai'});
  return {id: 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: clip(s.t || 'New step', 140), summary: clip(s.summary, 600), do: clip(s.do, 600), links, done: false, notes: '', source: 'bot', added: today};
}
function applyTrackOps(track, out, extra, today) {
  const steps = track.steps || []; const applied = [];
  for (const op of out.ops || []) {
    if (op.op === 'add' && op.step) { const s = cleanStep(op.step, extra, today); const at = op.after ? steps.findIndex(x => x.id === op.after) : -1; steps.splice(at >= 0 ? at + 1 : steps.length, 0, s); applied.push('Added: ' + s.t); }
    else if (op.op === 'update') { const s = steps.find(x => x.id === op.id); if (!s || s.done) continue; const f = op.fields || {};
      for (const k of ['t', 'summary', 'do']) if (typeof f[k] === 'string' && f[k].trim()) s[k] = clip(f[k], k === 't' ? 140 : 1200);
      const add = cleanStep({links: op.add_links || [], video_search: op.video_search || []}, extra, today).links; const have = new Set((s.links || []).map(l => l.url)); s.links = [...(s.links || []), ...add.filter(l => !have.has(l.url))]; applied.push('Updated: ' + s.t); }
    else if (op.op === 'remove') { const i = steps.findIndex(x => x.id === op.id); if (i >= 0 && !steps[i].done && steps[i].source !== 'me') { applied.push('Removed: ' + steps[i].t); steps.splice(i, 1); } }
  }
  track.steps = steps; return applied;
}
const STEP_SHAPE = '{"t":"step title","summary":"2-3 sentences","do":"one hands-on exercise","video_search":["YouTube search query"],"links":[{"label":"...","url":"official docs / GitHub / arXiv / a news url from the list"}]}';
function trackPrompt(t, task, news) {
  return `You maintain a step-by-step learning track for an early-career engineer who builds GenAI apps.
Track: "${t.title}" — ${t.summary || ''}
Steps (id | title | summary):\n${(t.steps || []).map(s => `${s.id} | ${s.t}${s.done ? ' [done]' : ''}${s.source === 'me' ? ' [learner-written]' : ''} | ${clip(s.summary, 160)}`).join('\n')}
${news.length ? `Recent news (title | url | summary):\n${news.map(n => `${n.title} | ${n.url} | ${clip(n.summary, 160)}`).join('\n')}\n` : ''}Task: ${task}
Rules: never change [done] or [learner-written] steps; keep basics → advanced order; links must be real (official docs, GitHub, arXiv, or a url from the news list); use YouTube search queries instead of video URLs. If nothing is worth changing, return no ops.
JSON: {"note":"one sentence","ops":[{"op":"add","after":"step id or null","step":${STEP_SHAPE}},{"op":"update","id":"...","fields":{"t":"","summary":"","do":""},"add_links":[],"video_search":[]},{"op":"remove","id":"..."}]}`;
}
async function updateAcademy(db, today) {
  const tracks = db.tracks || {}; let changes = 0;
  const news = Object.values(db.news || {}).filter(n => n.date >= addDays(today, -3) && n.kind !== 'practice').slice(0, 30);
  const extra = new Set(news.map(n => n.url));
  const log = (t, text) => { t.changelog = [...(t.changelog || []), {d: today, by: 'bot', text: clip(text, 240)}].slice(-60); t.updated = nowIso(); };
  // 1) learner suggestions first
  for (const t of Object.values(tracks)) for (const s of (t.suggestions || []).filter(x => x.status === 'open')) {
    const out = await safe('suggestion', () => llm(trackPrompt(t, `Apply the learner's suggestion: "${s.text}"`, news), {json: true, max: 3000}), null); if (!out) continue;
    const applied = applyTrackOps(t, out, extra, today); Object.assign(s, {status: 'applied', reply: clip(out.note || applied.join('; ') || 'No change needed', 240)}); log(t, out.note || applied.join('; ')); changes++;
  }
  // 2) trends: pick which tracks today's news actually affects, then update at most 3
  if (news.length) {
    const pick = await safe('academy pick', () => llm(`Tracks:\n${Object.entries(tracks).map(([id, t]) => `${id}: ${t.title}`).join('\n')}\n\nToday's news:\n${news.map(n => `- ${n.title}: ${clip(n.summary, 140)}`).join('\n')}\n\nWhich tracks (max 3) should change because of genuinely important news? Include "trend-radar" if any item is a notable new trend. JSON: {"tracks":["id"]}`, {json: true, max: 400}), {tracks: []});
    for (const id of (pick.tracks || []).slice(0, 3)) { const t = tracks[id]; if (!t) continue;
      const task = id === 'trend-radar' ? 'Add at most 2 new steps for the most important new trends in the news (each linking the news url), and remove outdated trend steps older than about 2 months that were not written by the learner.' : 'Update this track with what is genuinely new in the news: at most 1 new step or a few new links on existing steps; update anything now outdated.';
      const out = await safe('academy ' + id, () => llm(trackPrompt(t, task, news), {json: true, max: 3000}), null); if (!out) continue;
      const applied = applyTrackOps(t, out, extra, today); if (applied.length) { log(t, out.note || applied.join('; ')); changes++; } }
  }
  return changes;
}


/* ---------------- Inbox: build study kits from links ---------------- */
const KIND_NAME = {youtube: 'YouTube', instagram: 'Instagram', paper: 'Paper', github: 'GitHub', article: 'Article', subject: 'Subject'};
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const meta = (html, prop) => decode((html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, 'i')) || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`, 'i')) || [])[1] || '');
async function linkContext(item) {
  if (item.kind === 'subject' || !item.url) return {title: item.title || '', text: ''};
  const url = item.url; const kind = item.kind || 'article'; let title = item.title || '', text = '';
  if (kind === 'youtube') {
    const o = await safe('yt oembed', () => getJSON('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url)), null);
    if (o) title = `${o.title} — ${o.author_name}`;
    const html = await safe('yt page', () => getText(url, {headers: {'user-agent': BROWSER_UA, 'accept-language': 'en'}}), '');
    const desc = (html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/) || [])[1];
    if (desc) text += 'Description: ' + JSON.parse('"' + desc + '"').slice(0, 3000) + '\n\n';
    const tracks = (html.match(/"captionTracks":(\[.*?\])/) || [])[1];
    if (tracks) { try { const list = JSON.parse(tracks); const tr = list.find(t => /^en/.test(t.languageCode)) || list[0];
      const xml = await getText(tr.baseUrl.replace(/\\u0026/g, '&'), {headers: {'user-agent': BROWSER_UA}});
      const lines = [...xml.matchAll(/<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)].map(m => { const t = Math.floor(+m[1]); return `[${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}] ${decode(m[2])}`; });
      if (lines.length) text += 'Transcript:\n' + lines.join('\n'); } catch (e) { log('captions: ' + e.message); } }
  } else if (kind === 'instagram') {
    const html = await safe('ig', () => getText(url, {headers: {'user-agent': 'facebookexternalhit/1.1', 'accept-language': 'en'}}), '');
    title = title || meta(html, 'og:title'); const d = meta(html, 'og:description') || meta(html, 'description'); if (d) text = 'Caption/description: ' + d;
  } else if (kind === 'paper') {
    const id = (url.match(/(\d{4}\.\d{4,5})/) || [])[1];
    if (id) { const xml = await safe('arxiv', () => getText('https://export.arxiv.org/api/query?id_list=' + id), ''); title = decode((xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/) || [])[1]) || title; text = 'Abstract: ' + decode((xml.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]); }
  } else if (kind === 'github') {
    const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/);
    if (m) { const auth = env.GIST_TOKEN ? {authorization: 'Bearer ' + env.GIST_TOKEN} : {};
      const r = await safe('gh repo', () => getJSON(`https://api.github.com/repos/${m[1]}/${m[2]}`, {headers: auth}), null); if (r) { title = r.full_name; text = `Description: ${r.description || ''}\nStars: ${r.stargazers_count}\nTopics: ${(r.topics || []).join(', ')}\n\n`; }
      const readme = await safe('readme', () => getText(`https://api.github.com/repos/${m[1]}/${m[2]}/readme`, {headers: {...auth, accept: 'application/vnd.github.raw'}}), ''); text += 'README:\n' + readme.slice(0, 12000); }
  }
  if (!text) { const html = await safe('page', () => getText(url, {headers: {'user-agent': BROWSER_UA}}), '');
    title = title || meta(html, 'og:title') || decode((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]); text = decode(html.replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, ' ')).slice(0, 14000); }
  return {title: clip(title, 200), text};
}
function kitPrompt(item, ctx, db) {
  const cats = Object.entries(db.categories || {}).map(([id, c]) => `${id}: ${c.name}`).join(', ');
  const tops = Object.values(db.topics || {}).map(t => t.title).slice(0, 250).join('; ');
  const text = [item.text, ctx.text].filter(Boolean).join('\n\n').slice(0, 16000);
  const subj = item.kind === 'subject';
  const head = subj ? `The learner wants to study this subject from scratch: "${item.title}".\nBuild a complete, step-by-step learning path (6-10 steps from fundamentals to a small project, 5-8 sub-topics in learning order). Use what you know; for fast-moving tools say what to verify in the official docs.` : `Turn this ${KIND_NAME[item.kind] || 'link'} into a study kit for the learner.\nLink: ${item.url}\nTitle: ${ctx.title || item.title || '(unknown)'}`;
  return `${head}\nLearner's note: ${item.note || '(none)'}
Content text (transcript / caption / abstract / README; may be partial or empty):\n"""${text || '(not available: rely on the link, title and note; set confidence "low")'}"""
Existing categories (id: name): ${cats}\nExisting topic titles: ${tops}
Reply with only JSON:
{"subject":"short title","cat":"existing category id or a short new category name","level":"Beginner|Intermediate|Advanced","confidence":"high|low","summary":"3-6 sentence Markdown summary","key_points":[{"t":"timestamp like 03:12 or empty","text":"..."}],"main_topic":"exact existing topic title if same subject, else a new concise topic title","topics":[{"title":"...","why":"...","parent":"exact existing title or null"}],"flashcards":[{"q":"...","a":"..."}],"exercise":"one hands-on task","plan":[{"t":"step","minutes":20,"how":"one line"}],"resources":[{"label":"...","url":"official docs, GitHub or arXiv URL you are certain exists"}],"video_search":["3-4 YouTube search queries"],"learn_next":[{"title":"follow-up subject","why":"one sentence"}]}
Rules: also give exactly 3 learn_next subjects; 4-6 key points (use transcript timestamps when present), 2-5 related topics not already existing, 4-6 flashcards, 3-6 plan steps where step 1 is to watch/read the original.`;
}
const newId = s => slug(s).slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6);
function applyKit(db, item, kit, today) {
  const cats = (db.categories ||= {}); let cat = String(kit.cat || '');
  if (!cats[cat]) { const hit = Object.entries(cats).find(([, c]) => String(c.name).toLowerCase() === cat.toLowerCase()); if (hit) cat = hit[0];
    else if (cat) { const id = slug(cat).slice(0, 24); const n = Object.keys(cats).length; cats[id] ||= {name: clip(cat, 40), code: cat.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'NEW', color: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#008300'][n % 8], order: n, updated: nowIso()}; cat = id; }
    else cat = Object.keys(cats)[0] || 'ai'; }
  const topics = (db.topics ||= {}); const find = t => Object.entries(topics).find(([, x]) => String(x.title).toLowerCase() === String(t || '').toLowerCase());
  const orig = item.url ? {label: `${KIND_NAME[item.kind] || 'Source'}: ${clip(kit.subject || item.url, 80)}`, url: item.url} : null;
  const extra = cleanStep({links: kit.resources || [], video_search: kit.video_search || []}, new Set(), today).links;
  const cards = (kit.flashcards || []).filter(c => c && c.q && c.a).slice(0, 6).map(c => ({q: clip(c.q, 300), a: clip(c.a, 500)}));
  const summary = String(kit.summary || '').slice(0, 3000); const base = {notes: '', related: [], srs: null, chat: [], teach: null, log: [{d: today, a: 'added'}], created: nowIso(), updated: nowIso()};
  let mainId; const ex = find(kit.main_topic);
  if (ex) { mainId = ex[0]; const t = ex[1]; const have = new Set((t.resources || []).map(r => r.url)); t.resources = [...(t.resources || []), ...[orig, ...extra].filter(r => r && !have.has(r.url)).map(r => ({label: r.label, url: r.url}))]; t.cards = [...(t.cards || []), ...cards.filter(c => !(t.cards || []).some(o => o.q === c.q))]; if (!t.explain) t.explain = summary; t.updated = nowIso(); }
  else { mainId = newId(kit.main_topic || kit.subject); topics[mainId] = {...base, title: clip(kit.main_topic || kit.subject, 90), cat, status: 'todo', source: 'me', priority: 2, parent: null, notes: item.note || '', explain: summary, cards, why: item.kind === 'subject' ? 'You asked to learn this' : `From a ${KIND_NAME[item.kind] || 'link'} you sent`, resources: [orig, ...extra].filter(Boolean).map(r => ({label: r.label, url: r.url})), ...(cards.length ? {kitReview: true, srs: {S: 3, D: 5, reps: 1, lapses: 0, last: today, due: addDays(today, 1), interval: 1}} : {})}; }
  const newTopics = [];
  for (const r of (kit.topics || []).slice(0, item.kind === 'subject' ? 8 : 5)) { if (!r?.title || find(r.title)) continue; const p = find(r.parent); const id = newId(r.title);
    topics[id] = {...base, title: clip(r.title, 90), cat, status: item.kind === 'subject' ? 'todo' : 'suggested', source: 'ai', priority: 2, parent: p ? p[0] : mainId, why: clip(r.why, 220), cards: [], explain: '', resources: []}; newTopics.push(id); }
  const steps = (kit.plan || []).slice(0, 10).map((s, i) => ({id: 's' + (i + 1), t: clip(s.t || 'Step', 160), url: i === 0 ? (item.url || '') : '', dur: s.minutes ? `${Math.min(240, Math.max(5, +s.minutes || 20))}:00` : '', sec: '', done: false}));
  if (kit.exercise) steps.push({id: 's' + (steps.length + 1), t: 'Exercise: ' + clip(kit.exercise, 150), url: '', dur: '', sec: '', done: false});
  const kp = (kit.key_points || []).slice(0, 8).map(k => ({t: clip(k.t, 10), text: clip(k.text, 300)}));
  const oldPath = item.result?.pathId && db.paths?.[item.result.pathId]; const pathId = oldPath ? item.result.pathId : newId('kit ' + kit.subject);
  if (oldPath) steps.forEach(st => { if ((oldPath.steps || []).some(o => o.t === st.t && o.done)) st.done = true; });
  (db.paths ||= {})[pathId] = {title: (item.kind === 'subject' ? 'Learning path: ' : 'Study kit: ') + clip(kit.subject, 100), kind: 'kit', cat, url: item.url || '', source: 'me', steps, links: extra, notes: `${summary}\n\nKey points:\n${kp.map(k => `- ${k.t ? k.t + ' ' : ''}${k.text}`).join('\n')}`, inbox: item.id, created: nowIso(), updated: nowIso()};
  Object.assign(item, {rebuild: null, status: 'done', processedBy: 'bot', processed: today, error: null, updated: nowIso(),
    kit: {subject: clip(kit.subject, 140), cat, level: kit.level || '', confidence: kit.confidence || '', summary, key_points: kp, exercise: clip(kit.exercise, 400), plan: steps.map(s => ({t: s.t, minutes: parseInt(s.dur) || 0})), videos: [], searches: (kit.video_search || []).slice(0, 4).map(q => clip(q, 120)), next: (kit.learn_next || []).filter(n => n?.title).slice(0, 3).map(n => ({title: clip(n.title, 100), why: clip(n.why, 160)}))},
    result: {topicId: mainId, pathId, newTopics}});
  return kit.subject;
}
async function processInbox(db, today) {
  const done = [];
  for (const [id, item] of Object.entries(db.inbox || {})) {
    if (item.status !== 'pending') continue; item.id = id;
    try { const ctx = await linkContext(item); const kit = await llm(kitPrompt(item, ctx, db), {json: true, max: 3500}); if (!kit?.subject) throw new Error('no study kit returned');
      if (ctx.title && !item.title) item.title = ctx.title; done.push(applyKit(db, item, kit, today)); }
    catch (e) { Object.assign(item, {status: 'failed', error: clip(e.message, 160), updated: nowIso()}); }
    delete item.id;
  }
  return done;
}


/* ---------------- Research dossiers (same shape as the app) ---------------- */
const DOSSIER_SHAPE = `{"title":"clear name","summary":"2-3 sentence plain summary","relevance":{"score":1-5,"verdict":"one line: should this learner invest time now?","why":"Markdown: how it connects to their goals, work and projects"},
"what":"Markdown: what it is, key concepts","how_it_works":"Markdown: the mechanism, step by step",
"how_to_learn":[{"t":"step","minutes":30,"how":"what to do","links":[{"label":"...","url":"..."}]}],
"where_used":["real use case / company / product"],"free_alternatives":[{"name":"...","url":"...","note":"what is free, limits"}],"paid_options":[{"name":"...","url":"...","note":"..."}],
"examples":[{"title":"Example 1: ...","body":"Markdown worked example, with a short code block if useful"},{"title":"Example 2: ...","body":"..."}],
"architecture":"Markdown (reverse-engineer mode): likely architecture, components, data flow, tech stack","build_your_own":[{"t":"step","how":"..."}],
"comparison":"Markdown table (compare mode): options vs criteria","resources":[{"label":"...","url":"..."}],"video_search":["YouTube search query"],
"related_topics":[{"title":"...","why":"..."}],"tasks":["concrete to-do, e.g. Implement X in 50 lines"],"freshness":"what changed recently / is it still current","sources":[{"label":"...","url":"..."}]}`;
async function webContext(q) {
  const out = []; const enc = encodeURIComponent(q);
  await safe('wiki', async () => { const s = await getJSON(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${enc}&limit=3`);
    for (const p of (s.pages || []).slice(0, 3)) { const d = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`); if (d.extract) out.push({label: 'Wikipedia: ' + d.title, url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${p.key}`, text: clip(d.extract, 900)}); } });
  await safe('gh search', async () => { const s = await gh(`/search/repositories?q=${enc}&sort=stars&order=desc&per_page=6`);
    for (const r of s.items || []) out.push({label: 'GitHub: ' + r.full_name + ` (${r.stargazers_count}★)`, url: r.html_url, text: clip(r.description, 300) + (r.pushed_at ? ` · last push ${r.pushed_at.slice(0, 10)}` : '')}); });
  await safe('arxiv search', async () => { const x = await getText(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent('"' + q + '"')}&sortBy=relevance&max_results=5`);
    for (const e of x.split('<entry>').slice(1)) { const t = decode((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]); const id = decode((e.match(/<id>([\s\S]*?)<\/id>/) || [])[1]); const sm = decode((e.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]); const d = decode((e.match(/<published>([\s\S]*?)<\/published>/) || [])[1]).slice(0, 10);
      if (t && id) out.push({label: 'arXiv: ' + clip(t, 120), url: id.replace('http://', 'https://').replace(/v\d+$/, ''), text: `${d} · ${clip(sm, 500)}`}); } });
  await safe('hn search', async () => { const s = await getJSON(`https://hn.algolia.com/api/v1/search?query=${enc}&tags=story&hitsPerPage=6`);
    for (const h of s.hits || []) if (h.url && h.points > 20) out.push({label: 'HN: ' + clip(h.title, 120), url: h.url, text: `${h.points} points · ${String(h.created_at || '').slice(0, 10)}`}); });
  return out;
}
function dossierPrompt(r, db, ctx, extra = '') {
  const tops = Object.values(db.topics || {}).filter(t => t.status !== 'suggested').map(t => `${t.title} [${t.status}]`).slice(0, 120).join('; ');
  const projs = Object.values(db.projects || {}).map(p => p.title).join('; ');
  const hours = db.meta?.profile?.hours || 4;
  const modeTxt = r.mode === 'reverse' ? 'REVERSE-ENGINEER it: explain how it most likely works inside (architecture, components, data flow, tech stack), then give build_your_own steps for a minimal version, and open-source equivalents as free_alternatives.'
    : r.mode === 'compare' ? 'COMPARE the options it names (or the main options in that space): fill comparison with a Markdown table and give a clear recommendation in relevance.verdict.'
    : 'Teach it: what it is, how it works, how to learn it step by step, where it is used, and free alternatives to paid tools.';
  return `Research "${r.query}" for the learner.${r.note ? `\nTheir note: ${r.note}` : ''}
${modeTxt}
Always include exactly 2 worked examples, a step-by-step learning path sized for ~${hours} study hours a week, honest relevance to THIS learner, and 3-6 concrete tasks (e.g. "implement it", "try the free tier on X").
Their current topics: ${tops || 'none'}\nTheir projects: ${projs || 'none'}
WEB FINDINGS gathered today (prefer these as links and sources; mention dates in freshness):\n${ctx.map((c, i) => `[${i + 1}] ${c.label} — ${c.url}\n${c.text}`).join('\n') || '(none found)'}${extra}
Links: use the web findings above, official sites, docs, GitHub or arXiv; for videos give YouTube search queries. If unsure about a URL, leave "url" empty.
Reply with only JSON in this shape:\n${DOSSIER_SHAPE}`;
}
const clampN = (n, a, b) => Math.max(a, Math.min(b, n));
function cleanDossier(d, found, today) {
  const ok = u => /^https:\/\//.test(u || '') && (found.has(u) || trusted(u, found));
  const links = arr => cleanStep({links: (arr || []).filter(l => l && l.url), video_search: []}, found, today).links;
  d = {...d};
  d.how_to_learn = (d.how_to_learn || []).slice(0, 10).map(s => ({t: clip(s.t, 160), minutes: clampN(Number(s.minutes) || 30, 5, 600), how: clip(s.how, 400), links: links(s.links)}));
  for (const k of ['free_alternatives', 'paid_options']) d[k] = (d[k] || []).slice(0, 8).map(a => ({name: clip(a.name, 80), url: ok(a.url) ? a.url : '', note: clip(a.note, 240)}));
  d.examples = (d.examples || []).slice(0, 3).map(e => ({title: clip(e.title || 'Example', 140), body: String(e.body || '').slice(0, 4000)}));
  d.resources = [...links(d.resources), ...cleanStep({links: [], video_search: (d.video_search || []).slice(0, 3)}, found, today).links];
  d.related_topics = (d.related_topics || []).slice(0, 6).map(t => ({title: clip(t.title, 90), why: clip(t.why, 200)})).filter(t => t.title);
  d.tasks = (d.tasks || []).slice(0, 8).map(t => clip(t, 200));
  d.sources = links(d.sources);
  d.relevance = {score: 3, verdict: '', why: '', ...(d.relevance || {})}; d.relevance.score = clampN(Number(d.relevance.score) || 3, 1, 5);
  return d;
}
async function processResearch(db, today, {weekly = false} = {}) {
  const done = []; const all = Object.entries(db.research || {});
  const due = all.filter(([, r]) => ['pending', 'draft', 'improve'].includes(r.status) || (weekly && r.watch && r.status === 'done' && String(r.researched || '') < addDays(today, -6))).slice(0, 4);
  for (const [id, r] of due) {
    try {
      const ctx = await webContext(r.query); const found = new Set(ctx.map(c => c.url));
      const improving = r.status === 'improve' || (r.status === 'done' && r.watch);
      const extra = r.dossier && (improving || r.status === 'draft') ? `\n\nCURRENT DOSSIER (improve it, keep what is good, keep real links):\n${JSON.stringify(r.dossier).slice(0, 12000)}\n\nIMPROVEMENT REQUESTED: ${r.status === 'improve' ? (r.improveNote || 'make it better') : r.status === 'draft' ? 'replace guesses with the web findings and add real sources' : 'update it with anything new from the web findings'}` : '';
      const d = cleanDossier(await llm(dossierPrompt(r, db, ctx, extra), {json: true, max: 6000}), found, today);
      if (!d.title && !d.summary) throw new Error('empty dossier');
      if (!d.sources.length) d.sources = ctx.slice(0, 8).map(c => ({label: c.label, url: c.url}));
      const what = r.status === 'improve' ? 'Improved: ' + clip(r.improveNote, 140) : r.status === 'done' ? 'Weekly refresh' : `Researched (${ctx.length} web sources)`;
      Object.assign(r, {dossier: d, status: 'done', researched: today, researchedBy: 'your bot', improveNote: null, error: null, working: false, updated: nowIso(), history: [...(r.history || []), {d: today, by: 'bot', text: what}].slice(-20)});
      done.push(d.title || r.query);
    } catch (e) { Object.assign(r, {status: r.dossier ? r.status : 'failed', error: clip(e.message, 160), updated: nowIso()}); }
  }
  return done;
}

/* ---------------- Book → Notion / Google Drive (your own tokens) ---------------- */
function mdToNotion(md) {
  const rt = text => { const out = []; let rest = String(text); const re = /\[([^\]]+)\]\((https?:[^)\s]+)\)/; let m;
    while ((m = rest.match(re))) { if (m.index) out.push({type: 'text', text: {content: rest.slice(0, m.index)}}); out.push({type: 'text', text: {content: m[1], link: {url: m[2]}}}); rest = rest.slice(m.index + m[0].length); }
    if (rest) out.push({type: 'text', text: {content: rest}});
    return out.flatMap(o => { const c = o.text.content.replace(/\*\*([^*]+)\*\*/g, '$1'); const parts = []; for (let i = 0; i < c.length || i === 0; i += 1900) parts.push({type: 'text', text: {...o.text, content: c.slice(i, i + 1900)}}); return parts; }).slice(0, 90); };
  const blocks = []; const lines = String(md).replace(/\r/g, '').split('\n'); let code = null;
  const B = (type, text) => blocks.push({object: 'block', type, [type]: {rich_text: rt(text)}});
  for (const line of lines) {
    if (code) { if (/^```/.test(line)) { blocks.push({object: 'block', type: 'code', code: {language: 'plain text', rich_text: [{type: 'text', text: {content: code.join('\n').slice(0, 1990)}}]}}); code = null; } else code.push(line); continue; }
    if (/^```/.test(line)) { code = []; continue; }
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) B('heading_' + m[1].length, m[2]);
    else if (/^---+$/.test(line.trim())) blocks.push({object: 'block', type: 'divider', divider: {}});
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) B('bulleted_list_item', m[1]);
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) B('numbered_list_item', m[1]);
    else if ((m = line.match(/^>\s?(.*)/))) B('quote', m[1]);
    else B('paragraph', line);
  }
  return blocks;
}
const notion = (path, method = 'GET', body) => getJSON('https://api.notion.com/v1' + path, {method, headers: {authorization: 'Bearer ' + env.NOTION_TOKEN, 'notion-version': '2022-06-28', 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});
async function bookToNotion(md, sync, title) {
  const blocks = mdToNotion(md.replace(/^# .*\n+/, ''));
  const page = await notion('/pages', 'POST', {parent: {page_id: env.NOTION_PAGE_ID}, icon: {type: 'emoji', emoji: '📘'}, properties: {title: {title: [{type: 'text', text: {content: title}}]}}, children: blocks.slice(0, 100)});
  for (let i = 100; i < blocks.length; i += 100) await notion(`/blocks/${page.id}/children`, 'PATCH', {children: blocks.slice(i, i + 100)});
  if (sync.notionPageId && sync.notionPageId !== page.id) await safe('archive old notion page', () => notion('/pages/' + sync.notionPageId, 'PATCH', {archived: true}));
  Object.assign(sync, {notionPageId: page.id, notionUrl: page.url, notionSynced: dateIn()});
}
async function bookToDrive(txt, sync, title) {
  const t = await getJSON('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: env.GDRIVE_CLIENT_ID, client_secret: env.GDRIVE_CLIENT_SECRET, refresh_token: env.GDRIVE_REFRESH_TOKEN, grant_type: 'refresh_token'}).toString()});
  const H = {authorization: 'Bearer ' + t.access_token}; let r;
  if (sync.driveFileId) r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${sync.driveFileId}?uploadType=media&fields=id,webViewLink`, {method: 'PATCH', headers: {...H, 'content-type': 'text/plain; charset=UTF-8'}, body: txt});
  if (!sync.driveFileId || r.status === 404) { const b = 'lgb' + Date.now();
    r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {method: 'POST', headers: {...H, 'content-type': 'multipart/related; boundary=' + b},
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name: title + '.txt', mimeType: 'text/plain', ...(env.GDRIVE_FOLDER_ID ? {parents: [env.GDRIVE_FOLDER_ID]} : {})})}\r\n--${b}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${txt}\r\n--${b}--`}); }
  if (!r.ok) throw new Error('Drive said ' + r.status + ' ' + clip(await r.text(), 160));
  const j = await r.json(); Object.assign(sync, {driveFileId: j.id, driveUrl: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view`, driveSynced: dateIn()});
}
function mdToTxt(m) {
  return m.replace(/^---$/gm, '\u0000HR').replace(/^#\s+(.*)$/gm, (_, t) => `\n${t.toUpperCase()}\n${'='.repeat(Math.min(70, t.length))}`).replace(/^##\s+(.*)$/gm, (_, t) => `\n${t}\n${'-'.repeat(Math.min(70, t.length))}`).replace(/^###\s+(.*)$/gm, '\n$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2').replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:)!?]|$)/gm, '$1$2').replace(/`([^`\n]+)`/g, '$1').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 <$2>').replace(/^\u0000HR$/gm, '\n' + '~'.repeat(40) + '\n').replace(/\n{3,}/g, '\n\n');
}
async function syncBook(db) {
  const md = (await safe('book file', () => gistFile('learning-galaxy-book.md'), '')) || db.meta?.book?.markdown || '';
  if (!md) { log('book: no learning-galaxy-book.md in the gist yet (open the app once with auto-sync on)'); return ''; }
  const sync = (db.meta.bookSync ||= {}); const title = `${db.meta?.profile?.name || 'My'} Learning Galaxy Book`; const did = [];
  if (env.NOTION_TOKEN && env.NOTION_PAGE_ID) { const ok = await safe('notion', async () => { await bookToNotion(md, sync, title); return true; }, false); if (ok) did.push('Notion'); }
  if (env.GDRIVE_CLIENT_ID && env.GDRIVE_CLIENT_SECRET && env.GDRIVE_REFRESH_TOKEN) { const ok = await safe('drive', async () => { await bookToDrive(mdToTxt(md), sync, title); return true; }, false); if (ok) did.push('Google Drive'); }
  sync.updated = nowIso(); return did.join(' + ');
}

/* ---------------- Trending snapshot ---------------- */
const AI_WORDS = /\b(ai|llm|gpt|agent|agents|rag|mcp|model|models|inference|transformer|diffusion|embedding|vector|prompt|claude|openai|gemini|llama|qwen|deepseek|mistral|voice|speech|tts|stt|ml|machine learning|neural|copilot|cursor|fine-?tun|lora|vllm|ollama|langchain|llamaindex|autogen|crew)\b/i;
async function githubTrending() {
  const html = await safe('github trending', () => getText('https://github.com/trending?since=daily', {headers: {'user-agent': BROWSER_UA, 'accept-language': 'en'}}), '');
  return [...html.matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)].map(([, a]) => {
    const href = (a.match(/<h2[^>]*>\s*<a[^>]*href="\/([^"]+)"/) || [])[1]; if (!href) return null;
    const desc = decode((a.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1]); const lang = decode((a.match(/itemprop="programmingLanguage">([^<]+)</) || [])[1]);
    const num = s => Number(String(s || '0').replace(/[^\d]/g, '')) || 0;
    const stars = num((a.match(/href="\/[^"]+\/stargazers"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/) || [])[1]); const today = num((a.match(/([\d,]+)\s+stars\s+today/) || [])[1]);
    const name = href.trim(); return {name, url: 'https://github.com/' + name, desc: clip(desc, 240), lang, stars, today, ai: AI_WORDS.test(name + ' ' + desc)};
  }).filter(Boolean).slice(0, 25);
}
async function snapshotTrends(db, today, picked) {
  let repos = await githubTrending();
  if (!repos.length) repos = Object.values(db.news || {}).filter(n => n.kind === 'repo' && n.date >= addDays(today, -3)).map(n => ({name: n.title, url: n.url, desc: n.summary, stars: 0, today: 0, lang: '', ai: true}));
  const ai = Object.values(db.news || {}).filter(n => n.date === today && ['launch', 'paper', 'repo', 'article'].includes(n.kind) && n.cat !== 'sys' && n.cat !== 'dsa').slice(0, 20).map(n => ({title: n.title, url: n.url, source: n.source, kind: n.kind, summary: n.summary}));
  (db.trends ||= {})[today] = {date: today, repos, ai, source: 'github-action', updated: nowIso()};
  for (const d of Object.keys(db.trends)) if (d < addDays(today, -30)) delete db.trends[d];
  return repos.length;
}

/* ---------------- tasks ---------------- */
async function refreshNews(db, today) {
  const news = db.news ||= {}; const topics = Object.values(db.topics || {}); const cats = db.categories || {};
  const seen = new Set(Object.values(news).map(n => n.url));
  const since = addDays(today, -4); const sinceTs = Math.floor(Date.parse(since + 'T00:00:00Z') / 1000);
  let cands = [...await fromGitHub(addDays(today, -10)), ...await fromHN(sinceTs), ...await fromArxiv(), ...await fromFeeds(since)];
  const uniq = new Map(); for (const c of cands) if (c.url && !seen.has(c.url) && !uniq.has(c.url)) uniq.set(c.url, c); cands = [...uniq.values()].slice(0, 140);
  log(`news candidates: ${cands.length}`);
  const catList = Object.entries(cats).map(([id, c]) => `${id}: ${c.name}`).join(', ') || 'ai: AI, dsa: DSA, sys: System Design';
  const topicTitles = topics.map(t => t.title);
  // first unsolved A2Z problem → practice item (no LLM needed)
  const nextProb = Object.entries(db.problems || {}).map(([id, p]) => ({id, ...p})).filter(p => p.status !== 'solved').sort((a, b) => (a.step - b.step) || ((a.order || 0) - (b.order || 0)))[0];
  if (!cands.length && !nextProb) return {added: 0, suggested: 0};
  let pick = {items: [], topics: [], exercise: null};
  if (cands.length) pick = await llm(`You curate a daily study news feed for a software engineer learning these areas: ${catList}.
Their existing topics: ${topicTitles.join('; ').slice(0, 4000)}

Candidates (index | source | title | url | snippet):
${cands.map((c, i) => `${i} | ${c.source} | ${c.title} | ${c.url} | ${c.snippet}`).join('\n')}

Pick the 8-14 most useful, genuinely new items for them, spread across categories. Skip hype, listicles, job posts and duplicates.
For each: "i" (candidate index), "kind" (repo|paper|launch|article), "cat" (one of the category ids), "title" (clean, short), "summary" (1-2 plain sentences: what it is and why it matters), "topic" (exact existing topic title it relates to, or null).
Also: "topics": up to 3 important concepts from these items that are NOT already topics: {"title","cat","why" (one sentence naming the item),"parent" (exact existing topic title or null)}.
And "exercise": one small system design practice prompt: {"title","summary"}.
JSON shape: {"items":[...],"topics":[...],"exercise":{...}}`, {json: true, max: 4000});
  let added = 0;
  for (const it of (pick.items || []).slice(0, 14)) {
    const c = cands[Number(it.i)]; if (!c) continue;
    const id = slug(`${c.source}-${it.title || c.title}`); if (news[id]) continue;
    news[id] = {kind: ['repo', 'paper', 'launch', 'article'].includes(it.kind) ? it.kind : 'article', cat: cats[it.cat] ? it.cat : Object.keys(cats)[0] || 'ai',
      title: clip(it.title || c.title, 160), url: c.url, source: c.source, date: today, summary: clip(it.summary, 400), added: today, updated: nowIso(),
      ...(topicTitles.includes(it.topic) ? {topic: it.topic} : {})};
    added++;
  }
  if (nextProb && nextProb.url && !Object.values(news).some(n => n.url === nextProb.url && n.date === today))
    news[slug('practice-' + nextProb.title + '-' + today)] = {kind: 'practice', cat: cats.dsa ? 'dsa' : Object.keys(cats)[0] || 'dsa', title: `Today's DSA: ${nextProb.title}`, url: nextProb.url, source: `Striver A2Z step ${nextProb.step}`, date: today, summary: `Next unsolved problem in your A2Z order (${nextProb.diff || ''}). Solve it, then mark it solved in the DSA tracker.`, added: today, updated: nowIso()};
  if (pick.exercise?.title) news[slug('sd-exercise-' + today)] = {kind: 'practice', cat: cats.sys ? 'sys' : Object.keys(cats)[0] || 'sys', title: clip(pick.exercise.title, 140), url: 'https://github.com/donnemartin/system-design-primer', source: 'Design exercise', date: today, summary: clip(pick.exercise.summary, 400), added: today, updated: nowIso()};
  // topic suggestions
  const have = new Set(topicTitles.map(t => t.toLowerCase())); const byTitle = new Map(Object.entries(db.topics || {}).map(([id, t]) => [String(t.title).toLowerCase(), id]));
  let suggested = 0; db.topics ||= {};
  for (const s of (pick.topics || []).slice(0, 3)) {
    if (!s?.title || have.has(String(s.title).toLowerCase())) continue;
    const id = slug(s.title).slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6);
    db.topics[id] = {title: clip(s.title, 90), cat: cats[s.cat] ? s.cat : Object.keys(cats)[0] || 'ai', status: 'suggested', source: 'ai', priority: 2, parent: byTitle.get(String(s.parent || '').toLowerCase()) || null,
      related: [], notes: '', resources: [], cards: [], explain: '', why: clip(s.why, 240), srs: null, chat: [], teach: null, log: [{d: today, a: 'added'}], created: nowIso(), updated: nowIso()};
    suggested++;
  }
  // prune old unsaved news; remember what we removed so app copies drop it too
  const cutoff = addDays(today, -45); const pruned = [];
  for (const [id, n] of Object.entries(news)) if ((n.date || '') < cutoff && !n.savedTopic) { delete news[id]; pruned.push(id); }
  return {added, suggested, pruned};
}

function ytPlaylistId(url) { const m = String(url).match(/[?&]list=([A-Za-z0-9_-]+)/); return m && m[1]; }
async function importSteps(imp) {
  const pid = ytPlaylistId(imp.url);
  if (pid && env.YT_API_KEY) {
    const steps = []; let token = '';
    do { const r = await getJSON(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${pid}&key=${env.YT_API_KEY}${token ? '&pageToken=' + token : ''}`);
      for (const it of r.items || []) { const s = it.snippet; if (!s || /^(Private|Deleted) video$/.test(s.title)) continue; steps.push({t: s.title, url: `https://www.youtube.com/watch?v=${s.resourceId?.videoId}&list=${pid}`}); }
      token = r.nextPageToken || ''; } while (token && steps.length < 400);
    if (steps.length) return steps;
  }
  const html = await getText(imp.url, {headers: {'accept-language': 'en'}});
  if (pid) { // YouTube playlist page: titles live in the embedded initial data
    const vids = []; const seen = new Set();
    for (const m of html.matchAll(/"playlistVideoRenderer":\{"videoId":"([^"]+)"[\s\S]*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) {
      if (seen.has(m[1])) continue; seen.add(m[1]); vids.push({t: JSON.parse('"' + m[2] + '"'), url: `https://www.youtube.com/watch?v=${m[1]}&list=${pid}`}); }
    if (vids.length) return vids;
  }
  const text = decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')).slice(0, 30000);
  const out = await llm(`This is the text of a ${imp.kind || 'learning'} page (${imp.url}). Extract its ordered list of lessons / videos / chapters as study steps.
Only use titles that appear in the text. If there is no clear list, reply [].
Page text:\n"""${text}"""\nJSON: [{"t":"title","dur":"duration if shown or empty","sec":"section if any or empty"}]`, {json: true, max: 4000});
  return Array.isArray(out) ? out.filter(s => s && s.t) : [];
}
async function processImports(db, today) {
  const imports = db.imports || {}; let done = 0;
  for (const [id, imp] of Object.entries(imports)) {
    if (imp.status !== 'pending') continue;
    try {
      const steps = await importSteps(imp); if (!steps.length) throw new Error('no list of steps found on that page');
      const path = (db.paths ||= {})[imp.pathId || id] ||= {title: imp.title || imp.url, kind: imp.kind || 'course', cat: imp.cat || 'ai', url: imp.url, source: 'me', steps: [], notes: '', created: nowIso()};
      const kept = (path.steps || []).filter(s => s.done); const keptT = new Set(kept.map(s => s.t));
      path.steps = [...kept, ...steps.filter(s => !keptT.has(s.t)).map((s, i) => ({id: 's' + (kept.length + i + 1), t: clip(s.t, 160), url: s.url || '', dur: s.dur || '', sec: s.sec || '', done: false}))];
      path.updated = nowIso(); Object.assign(imp, {status: 'done', note: `${steps.length} steps imported`, updated: nowIso()}); done++;
    } catch (e) { Object.assign(imp, {status: 'failed', note: clip(e.message, 160), updated: nowIso()}); }
  }
  return done;
}

function dueCount(db, today) {
  const t = Object.values(db.topics || {}).filter(x => x.status === 'learned' && x.srs?.due && x.srs.due <= today).length;
  const p = Object.values(db.problems || {}).filter(x => x.status === 'solved' && x.srs?.due && x.srs.due <= today).length;
  return t + p;
}
function digest(db, today) {
  const due = dueCount(db, today);
  const plan = (db.plans || {})[mondayOf(today)]; const di = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).indexOf(weekday());
  const items = plan ? ((plan.days || [])[di]?.items || []).filter(i => !i.done).map(i => i.title) : [];
  const paths = Object.values(db.paths || {}).map(p => ({p, next: (p.steps || []).find(s => !s.done), done: (p.steps || []).filter(s => s.done).length})).filter(x => x.next).sort((a, b) => b.done - a.done || String(b.p.updated).localeCompare(String(a.p.updated)));
  const top = Object.values(db.news || {}).filter(n => n.date === today && n.kind !== 'practice')[0];
  const parts = [`${due} to review`];
  if (items.length) parts.push(`Plan: ${items.slice(0, 3).join(' · ')}`);
  if (paths[0]) parts.push(`Next: ${paths[0].next.t} (${paths[0].p.title})`);
  if (top) parts.push(`News: ${top.title}`);
  return parts.join('\n');
}
async function weeklyReport(db, today) {
  const mon = mondayOf(today); const inWeek = d => d && d >= mon && d <= today;
  const done = Object.values(db.done || {}).filter(d => inWeek(d.date));
  let minutes = 0; for (const [d, s] of Object.entries(db.sessions || {})) if (inWeek(d)) for (const e of s.entries || []) minutes += Number(e.min) || 0;
  let reviews = 0; for (const x of [...Object.values(db.topics || {}), ...Object.values(db.problems || {})]) for (const l of x.log || []) if (l.a === 'review' && inWeek(l.d)) reviews++;
  const solved = Object.values(db.problems || {}).filter(p => p.status === 'solved' && inWeek(p.solvedAt));
  const plan = (db.plans || {})[mon]; const planItems = plan ? (plan.days || []).flatMap(d => d.items || []) : [];
  const summary = {
    week: `${mon} to ${today}`, finished: done.map(d => ({kind: d.kind, title: d.title, reflection: d.reflection || undefined, confidence: d.confidence || undefined})).slice(0, 60),
    focusMinutes: minutes, reviews, problemsSolved: solved.map(p => `${p.title} (${p.diff})`), dueNow: dueCount(db, today),
    planDone: planItems.filter(i => i.done).length, planTotal: planItems.length,
    learning: Object.values(db.topics || {}).filter(t => t.status === 'learning').map(t => t.title),
    projects: Object.values(db.projects || {}).map(p => ({title: p.title, status: p.status, next: (p.milestones || []).find(m => !m.done)?.t})),
    paths: Object.values(db.paths || {}).map(p => ({title: p.title, done: (p.steps || []).filter(s => s.done).length, total: (p.steps || []).length, next: (p.steps || []).find(s => !s.done)?.t})),
    nextProblems: Object.values(db.problems || {}).filter(p => p.status !== 'solved').sort((a, b) => (a.step - b.step) || ((a.order || 0) - (b.order || 0))).slice(0, 4).map(p => p.title),
    interviews: Object.values(db.interviews || {}).filter(i => inWeek(i.date) && i.grade).map(i => `${i.title}: ${i.grade.score}/10`),
    hoursPerWeek: db.meta?.profile?.hours || 4,
    gaps: [
      ...Object.values(db.topics || {}).filter(t => (t.status === 'learning' || t.status === 'learned') && t.parent && db.topics[t.parent] && db.topics[t.parent].status !== 'learned').map(t => `${t.title} is being learned before its foundation ${db.topics[t.parent].title}`),
      ...Object.values(db.projects || {}).filter(p => p.status !== 'shipped').map(p => ({p, miss: (p.prereqs || []).map(id => db.topics?.[id]).filter(t => t && t.status !== 'learned')})).filter(x => x.miss.length).map(x => `${x.p.title} still needs ${x.miss.map(t => t.title).slice(0, 3).join(', ')}`)
    ].slice(0, 8)
  };
  const text = await llm(`Write a weekly study report in Markdown (under 280 words) from this JSON. Sections: **This week** (counts), **Wins** (2-4 specific things, quote reflections when present), **Slipping** (overdue reviews, low-confidence items, plan items not done, stalled projects/paths, and the knowledge gaps listed), **Next week** (3-5 concrete small items that fit ${summary.hoursPerWeek} hours, naming real items from the data). Honest and encouraging, no filler.\n\n${JSON.stringify(summary)}`, {max: 1500});
  (db.reports ||= {})[mon] = {week: summary.week, created: nowIso(), updated: nowIso(), text, stats: {finished: done.length, reviews, minutes, problems: solved.length}};
  return `Week ${summary.week}: ${done.length} finished, ${reviews} reviews, ${Math.round(minutes / 6) / 10}h focus.`;
}
async function notify(title, body) {
  if (!env.NTFY_TOPIC) return;
  await safe('ntfy', () => fetch(`${env.NTFY_SERVER || 'https://ntfy.sh'}/${env.NTFY_TOPIC}`, {method: 'POST', headers: {Title: title, Tags: 'star', ...(env.APP_URL ? {Click: env.APP_URL} : {})}, body}));
}

/* ---------------- main ---------------- */
export async function main() {
  for (const k of ['GIST_ID', 'GIST_TOKEN']) if (!env[k]) throw new Error(`Missing secret ${k}`);
  const today = dateIn(); const task = (env.TASK || 'auto').toLowerCase();
  const doMorning = task === 'auto' || task === 'morning' || task === 'both';
  const doBook = task === 'book';
  const doWeekly = task === 'weekly' || task === 'both' || (task === 'auto' && weekday() === 'Sun' && new Date().getUTCHours() >= 10);
  const store = await loadGist(); const db = (store.data ||= {});
  const meta = (db.meta ||= {}); const refresh = meta.refresh ||= {};
  let morningMsg = '', weeklyMsg = '', morningKits = [], researched = [], bookMsg = '';
  if (doMorning && !(task === 'auto' && doWeekly)) {
    const imported = await safe('imports', () => processImports(db, today), 0);
    const kits = await safe('inbox', () => processInbox(db, today), []); if (kits.length) log('study kits: ' + kits.join(', '));
    researched = await safe('research', () => processResearch(db, today), []); if (researched.length) log('research: ' + researched.join(', '));
    const r = await safe('news', () => refreshNews(db, today), {added: 0, suggested: 0, pruned: []});
    refresh.pruned = [...(r.pruned || []), ...(refresh.pruned || [])].slice(0, 300);
    const ac = await safe('academy', () => updateAcademy(db, today), 0); log(`academy changes: ${ac}`);
    const tn = await safe('trends', () => snapshotTrends(db, today), 0); log(`trending repos: ${tn}`);
    if (kits.length) morningKits = kits;
    morningMsg = digest(db, today) + (morningKits.length ? `\nNew study kit${morningKits.length > 1 ? 's' : ''}: ${morningKits.join(', ')}` : '') + (researched.length ? `\nResearch ready: ${researched.join(', ')}` : '');
    log(`news +${r.added}, suggestions +${r.suggested}, imports ${imported}`);
  }
  if (doWeekly) { weeklyMsg = await safe('weekly', () => weeklyReport(db, today), '');
    const rw = await safe('research refresh', () => processResearch(db, today, {weekly: true}), []); if (rw.length) log('research refreshed: ' + rw.join(', ')); }
  if (doWeekly || doBook) { bookMsg = await safe('book', () => syncBook(db), ''); if (bookMsg) log('book saved to ' + bookMsg); }
  Object.assign(refresh, {lastRun: nowIso(), lastDigest: morningMsg || refresh.lastDigest || '', bot: 'github-action', updated: nowIso()});
  await saveGist(store);
  if (morningMsg) await notify('Learning Galaxy · today', morningMsg);
  if (weeklyMsg) await notify('Learning Galaxy · weekly report', weeklyMsg + (bookMsg ? `\nYour book is updated in ${bookMsg}.` : ''));
  else if (doBook && bookMsg) await notify('Learning Galaxy · book', `Your book is updated in ${bookMsg}.`);
  log('done', morningMsg ? '\n' + morningMsg : '', weeklyMsg);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
