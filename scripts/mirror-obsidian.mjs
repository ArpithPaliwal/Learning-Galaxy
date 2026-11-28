#!/usr/bin/env node
// Mirror Learning Galaxy's cloud data (Supabase) into an Obsidian vault as plain markdown. One-way: cloud → vault.
//
//   node scripts/mirror-obsidian.mjs --vault "C:/Users/arpit/LearningGalaxyVault"            # from Supabase
//   node scripts/mirror-obsidian.mjs --vault <dir> --from-seed                                # from app/brain-seed.json
//
// Credentials: SUPABASE_URL + SUPABASE_SERVICE_KEY (+ optional LG_USER_ID) from the environment, or from the file
// given by --env (default: %LOCALAPPDATA%/learning-galaxy/mirror.env). NEVER commit that file.
// The mirror owns: Topics/ Courses/ Research/ Plans/ Paths/ Radar/ Kanban.md Dashboard.md Tasks.md DSA.md _backup/.
// Anything else in the vault (e.g. "My Notes/") is never touched. If the vault is a git repo, it commits + pushes.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const VAULT = arg('--vault', process.env.LG_VAULT || join(process.env.USERPROFILE || process.env.HOME, 'LearningGalaxyVault'));
const FROM_SEED = process.argv.includes('--from-seed');
const ENV_FILE = arg('--env', join(process.env.LOCALAPPDATA || join(process.env.HOME, '.config'), 'learning-galaxy', 'mirror.env'));
const TODAY = new Date().toISOString().slice(0, 10);
const log = (...a) => console.log('[mirror]', ...a);

if (existsSync(ENV_FILE)) for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

/* ---------------------------------------------------------------- load data */
async function fromSupabase() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error(`No Supabase credentials (set them in ${ENV_FILE}).`);
  const base = SUPABASE_URL.replace(/\/+$/, '');
  const H = { apikey: SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_KEY };
  let uid = process.env.LG_USER_ID;
  if (!uid) {
    const r = await fetch(base + '/auth/v1/admin/users?per_page=50', { headers: H });
    const users = r.ok ? ((await r.json()).users || []) : [];
    if (users.length !== 1) throw new Error(users.length ? 'Several users: set LG_USER_ID.' : 'NO_USER');
    uid = users[0].id;
  }
  const cols = {}; let offset = 0;
  for (;;) {
    const r = await fetch(`${base}/rest/v1/lg_docs?user_id=eq.${uid}&deleted=is.false&select=path,col,data&order=path.asc&limit=1000&offset=${offset}`, { headers: H });
    if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const rows = await r.json();
    for (const row of rows) { const id = row.path.split('/').slice(1).join('/'); (cols[row.col] ||= {})[id] = Object.assign({ id }, row.data || {}); }
    if (rows.length < 1000) break; offset += 1000;
  }
  return cols;
}
function fromSeed() {
  const d = JSON.parse(readFileSync(join(ROOT, 'app', 'brain-seed.json'), 'utf8'));
  const cols = { categories: {}, topics: {} };
  for (const [id, c] of Object.entries(d.categories)) cols.categories[id] = { id, ...c };
  for (const [id, t] of Object.entries(d.topics)) cols.topics[id] = { id, ...t };
  return cols;
}

/* ---------------------------------------------------------------- helpers */
const y = (v) => JSON.stringify(v ?? '');                     // JSON scalars/arrays are valid YAML
const fileSafe = (s) => String(s || 'Untitled').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
const LEVELS = ['Foundation', 'Beginner', 'Intermediate', 'Advanced', 'Expert', 'Frontier'];
function lane(t) {
  if (t.status === 'suggested') return 'inbox';
  if (t.status === 'learning') return t.mode === 'v' ? 'vertical' : 'horizontal';
  if (t.status === 'learned') return t.srs && t.srs.due && t.srs.due <= TODAY ? 'review' : 'mastered';
  return 'backlog';
}
const LANE_NAME = { inbox: 'Inbox', backlog: 'Backlog', horizontal: 'Horizontal · explore', vertical: 'Vertical · deep dive', review: 'Review', mastered: 'Mastered' };
const written = new Set();
function write(rel, text) { const p = join(VAULT, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text.replace(/\r?\n/g, '\n'), 'utf8'); written.add(p); }
function prune(dir) {
  const d = join(VAULT, dir); if (!existsSync(d)) return 0; let n = 0;
  const walk = (p) => { for (const f of readdirSync(p)) { const q = join(p, f); if (statSync(q).isDirectory()) { walk(q); if (!readdirSync(q).length) rmSync(q, { recursive: true }); } else if (f.endsWith('.md') && !written.has(q)) { rmSync(q); n++; } } };
  walk(d); return n;
}

/* ---------------------------------------------------------------- render */
function render(cols) {
  const cats = Object.values(cols.categories || {}).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const catName = (id) => (cols.categories?.[id]?.name) || id || 'Other';
  const topics = Object.values(cols.topics || {}).filter((t) => !t.hidden);
  // unique note names (Obsidian links by file name)
  const name = {}; const used = new Set();
  for (const t of topics) { let n = fileSafe(t.title); if (used.has(n.toLowerCase())) n = `${n} (${t.id.slice(-5)})`; used.add(n.toLowerCase()); name[t.id] = n; }
  const link = (id) => name[id] ? `[[${name[id]}]]` : null;
  const unlocks = {}; for (const t of topics) for (const p of t.prereqs || []) (unlocks[p] ||= []).push(t.id);

  for (const t of topics) {
    const order = cats.findIndex((c) => c.id === t.cat);
    const folder = `Topics/${String(order < 0 ? 99 : order + 1).padStart(2, '0')} ${fileSafe(catName(t.cat))}`;
    const L = lane(t);
    const fm = ['---', `id: ${y(t.id)}`, `title: ${y(t.title)}`, `track: ${y(catName(t.cat))}`, `track_id: ${y(t.cat)}`, `level: ${Number(t.level ?? 1)}`,
      `level_name: ${y(LEVELS[Number(t.level ?? 1)] || '')}`, `status: ${y(t.status || 'todo')}`, `lane: ${y(L)}`, `priority: ${Number(t.priority || 2)}`,
      `prereqs: ${y((t.prereqs || []).map(link).filter(Boolean))}`, `related: ${y((t.related || []).map(link).filter(Boolean))}`,
      `part_of: ${y(t.parent ? link(t.parent) || '' : '')}`, `review_due: ${y(t.srs?.due || '')}`, `researched: ${y(t.researched || '')}`,
      `confidence: ${y(t.confidence || '')}`, `source: ${y(t.source || '')}`, `updated: ${y(String(t.updated || '').slice(0, 10))}`,
      `tags: ${y(['lg/topic', 'lg/track/' + (t.cat || 'other'), 'lg/lane/' + L])}`, '---', ''];
    const links = [
      (t.prereqs || []).length ? `**Learn first:** ${(t.prereqs || []).map(link).filter(Boolean).join(' · ')}` : '',
      (unlocks[t.id] || []).length ? `**Unlocks:** ${unlocks[t.id].map(link).filter(Boolean).join(' · ')}` : '',
      (t.related || []).length ? `**Related:** ${(t.related || []).map(link).filter(Boolean).join(' · ')}` : '',
      t.parent && link(t.parent) ? `**Part of:** ${link(t.parent)}` : '',
    ].filter(Boolean).join('  \n');
    const body = [`# ${t.title}`, '', t.why ? `> ${String(t.why).replace(/\n/g, ' ')}` : '', '', `*${catName(t.cat)} · L${t.level ?? 1} ${LEVELS[t.level ?? 1] || ''} · ${LANE_NAME[L]}*`, '', links, '',
      String(t.explain || '').trim(), '',
      '## My notes', '', String(t.notes || '').trim() || '_(none yet — write them in the app)_', '',
      '## Resources', '', ...(t.resources || []).map((r) => `- [${String(r.label || r.url).replace(/[[\]]/g, '')}](${r.url})${r.kind ? ` · ${r.kind}` : ''}${r.year ? ` · ${r.year}` : ''}`), '',
      ...((t.cards || []).length ? ['## Flashcards', '', '#flashcards/lg', '', ...t.cards.map((c) => `${String(c.q).replace(/\n/g, ' ')}::${String(c.a).replace(/\n/g, ' ')}`), ''] : []),
    ];
    write(`${folder}/${name[t.id]}.md`, fm.join('\n') + body.join('\n'));
  }

  // Kanban board (obsidian-kanban format). Read-only mirror: move cards in the app.
  const lanes = ['inbox', 'backlog', 'horizontal', 'vertical', 'review', 'mastered'];
  const by = Object.fromEntries(lanes.map((l) => [l, topics.filter((t) => lane(t) === l).sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || String(a.title).localeCompare(b.title))]));
  write('Kanban.md', ['---', '', 'kanban-plugin: board', '', '---', '',
    ...lanes.flatMap((l) => [`## ${LANE_NAME[l]}`, '', ...by[l].map((t) => `- [${l === 'mastered' ? 'x' : ' '}] ${link(t.id)} #${(t.cat || 'other').replace(/[^a-z0-9-]/gi, '')}`), '']),
    '', '%% kanban:settings', '```', '{"kanban-plugin":"board","list-collapse":[false,false,false,false,false,true],"show-checkboxes":false}', '```', '%%', ''].join('\n'));

  // Dashboard (Dataview)
  write('Dashboard.md', `# Learning Galaxy — Dashboard
_Mirrored from the app on ${TODAY}. This vault is a read-only mirror of the cloud database; write your own notes in **My Notes/**._

## ⬇ Vertical (deep dive)
\`\`\`dataview
TABLE track, level_name AS "Level", researched FROM #lg/lane/vertical SORT level ASC
\`\`\`
## ↔ Horizontal (explore)
\`\`\`dataview
TABLE track, level_name AS "Level" FROM #lg/lane/horizontal SORT track ASC
\`\`\`
## Review due
\`\`\`dataview
LIST review_due FROM #lg/lane/review SORT review_due ASC
\`\`\`
## Progress by track
\`\`\`dataview
TABLE length(rows) AS Topics, length(filter(rows, (r) => r.status = "learned")) AS Mastered, length(filter(rows, (r) => r.status = "learning")) AS Learning
FROM #lg/topic GROUP BY track
\`\`\`
## Ready to start (backlog, lowest level first)
\`\`\`dataview
TABLE track, level FROM #lg/lane/backlog SORT level ASC LIMIT 25
\`\`\`
## Recently researched
\`\`\`dataview
TABLE track, researched FROM #lg/topic WHERE researched != "" SORT researched DESC LIMIT 15
\`\`\`
`);

  // Courses
  for (const c of Object.values(cols.courses || {})) {
    const mods = (c.modules || []).map((m) => [`## ${m.t || 'Module'}`, m.goal ? `_${m.goal}_` : '', ...(m.videos || []).map((v) => `- [${v.done ? 'x' : ' '}] ${v.url ? `[${(v.title || v.q || 'video').replace(/[[\]]/g, '')}](${v.url})` : (v.title || v.q || '')}${v.channel ? ` — ${v.channel}` : ''}${v.min ? ` · ${v.min} min` : ''}`), ''].join('\n')).join('\n');
    write(`Courses/${fileSafe(c.title || c.ask)}.md`, `---\nid: ${y(c.id)}\nstatus: ${y(c.status)}\ntags: ["lg/course"]\n---\n# ${c.title || c.ask}\n\n${c.summary || ''}\n\n${(c.outcomes || []).map((o) => '- ' + o).join('\n')}\n\n${mods}\n${c.project ? `## Project\n\n${c.project}\n` : ''}`);
  }
  // Research dossiers
  for (const r of Object.values(cols.research || {})) {
    const d = r.dossier || {};
    write(`Research/${fileSafe(d.title || r.query)}.md`, `---\nid: ${y(r.id)}\nquery: ${y(r.query)}\nstatus: ${y(r.status)}\nresearched: ${y(String(r.researched || '').slice(0, 10))}\ntopic: ${y(r.topic && link(r.topic) ? link(r.topic) : '')}\ntags: ["lg/research"]\n---\n# ${d.title || r.query}\n\n${d.summary ? `**${d.summary}**\n\n` : ''}${d.what || '_Not researched yet._'}\n\n${(d.how_to_learn || []).length ? '## How to learn it\n\n' + d.how_to_learn.map((x, i) => `${i + 1}. ${x.t}${x.url ? ` — ${x.url}` : ''}`).join('\n') : ''}\n${(d.sources || d.links || []).length ? '\n## Sources\n\n' + (d.sources || d.links).map((s) => `- ${s.url ? `[${s.label || s.title || s.url}](${s.url})` : JSON.stringify(s)}`).join('\n') : ''}\n`);
  }
  // Paths + AI Academy tracks
  for (const [col, kind] of [['paths', 'Path'], ['tracks', 'Academy']]) for (const p of Object.values(cols[col] || {})) {
    write(`Paths/${fileSafe(p.title)}.md`, `---\nid: ${y(p.id)}\nkind: ${y(kind)}\ntags: ["lg/path"]\n---\n# ${p.title}\n\n${p.summary || ''}\n\n${(p.steps || []).map((s) => `- [${s.done ? 'x' : ' '}] ${s.url ? `[${String(s.t).replace(/[[\]]/g, '')}](${s.url})` : s.t}${s.dur ? ` · ${s.dur}` : ''}`).join('\n')}\n`);
  }
  // Weekly plans
  for (const p of Object.values(cols.plans || {})) {
    write(`Plans/${fileSafe(p.week || p.id)}.md`, `---\nweek: ${y(p.week || p.id)}\ntags: ["lg/plan"]\n---\n# Week of ${p.week || p.id}\n\n${p.focus ? `**Focus:** ${p.focus}\n\n` : ''}${(p.days || []).map((d) => `## ${d.date}\n\n${(d.items || []).map((i) => `- [${i.done ? 'x' : ' '}] ${i.title}${i.minutes ? ` · ${i.minutes} min` : ''}`).join('\n') || '_rest_'}\n`).join('\n')}`);
  }
  // Tasks + DSA + Radar
  const tasks = Object.values(cols.tasks || {});
  write('Tasks.md', `# Tasks\n\n${tasks.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || String(a.due || '9').localeCompare(String(b.due || '9'))).map((t) => `- [${t.done ? 'x' : ' '}] ${t.title}${t.due ? ` 📅 ${t.due}` : ''}`).join('\n') || '_none_'}\n`);
  const probs = Object.values(cols.problems || {});
  if (probs.length) write('DSA.md', `# DSA practice\n\n${probs.filter((p) => p.status === 'solved').length}/${probs.length} solved\n\n${probs.sort((a, b) => (a.step || 0) - (b.step || 0)).map((p) => `- [${p.status === 'solved' ? 'x' : ' '}] [${String(p.title).replace(/[[\]]/g, '')}](${p.url}) · ${p.diff || ''}`).join('\n')}\n`);
  const news = Object.values(cols.news || {}).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 400);
  const months = {}; for (const n of news) (months[String(n.date || TODAY).slice(0, 7)] ||= []).push(n);
  for (const [m, items] of Object.entries(months)) write(`Radar/${m}.md`, `# Radar ${m}\n\n${items.map((n) => `- ${n.date || ''} · [${String(n.title).replace(/[[\]]/g, '')}](${n.url}) · ${n.kind || ''}${n.summary ? ` — ${n.summary}` : ''}`).join('\n')}\n`);

  return { topics: topics.length, courses: Object.keys(cols.courses || {}).length, research: Object.keys(cols.research || {}).length };
}

/* ---------------------------------------------------------------- main */
let cols, source = 'supabase';
if (FROM_SEED) { cols = fromSeed(); source = 'seed'; }
else {
  try { cols = await fromSupabase(); }
  catch (e) {
    if (e.message === 'NO_USER') { log('No signed-in user in Supabase yet (sign in once in the app → ⚡ App → Cloud sync). Using the curriculum seed for now.'); cols = fromSeed(); source = 'seed'; }
    else { console.error('[mirror] failed:', e.message); process.exit(1); }
  }
}
mkdirSync(VAULT, { recursive: true });
if (source === 'supabase' && !Object.keys(cols.topics || {}).length) {
  const s = fromSeed(); cols.topics = s.topics; cols.categories = Object.assign({}, s.categories, cols.categories || {});
  log('No topics in the cloud yet (open the updated app once to load the curriculum): showing the curriculum seed.');
}
mkdirSync(join(VAULT, 'My Notes'), { recursive: true });
if (!existsSync(join(VAULT, 'My Notes', 'Welcome.md'))) writeFileSync(join(VAULT, 'My Notes', 'Welcome.md'), '# My Notes\n\nThis folder is yours: the nightly mirror never touches it.\nEverything else (Topics, Courses, Research, Kanban, Dashboard…) is regenerated from the Learning Galaxy app every night.\nLink to any topic with [[double brackets]], e.g. [[LoRA]].\n');
const stats = render(cols);
let pruned = 0; for (const d of ['Topics', 'Courses', 'Research', 'Plans', 'Paths', 'Radar']) pruned += prune(d);
// full JSON snapshot = a real backup of the cloud data (keep 14)
if (source === 'supabase') {
  mkdirSync(join(VAULT, '_backup'), { recursive: true });
  writeFileSync(join(VAULT, '_backup', `lg-${TODAY}.json`), JSON.stringify(cols));
  const snaps = readdirSync(join(VAULT, '_backup')).filter((f) => /^lg-\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
  for (const f of snaps.slice(0, Math.max(0, snaps.length - 14))) rmSync(join(VAULT, '_backup', f));
}
log(`${source}: ${stats.topics} topics, ${stats.courses} courses, ${stats.research} research → ${VAULT} (${written.size} files, ${pruned} stale removed)`);
if (existsSync(join(VAULT, '.git'))) {
  try {
    execSync('git add -A', { cwd: VAULT, stdio: 'ignore' });
    const dirty = execSync('git status --porcelain', { cwd: VAULT }).toString().trim();
    if (dirty) { execSync(`git commit -qm "mirror ${TODAY} (${source})"`, { cwd: VAULT, stdio: 'ignore' }); log('committed'); }
    try { execSync('git push -q', { cwd: VAULT, stdio: 'ignore', timeout: 60000 }); log('pushed'); } catch { log('push skipped (no remote or offline)'); }
  } catch (e) { log('git step failed:', e.message); }
}
