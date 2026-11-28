/* Learning Galaxy — Brain
 * 3D knowledge graph (tracks on a ring = breadth, height = depth level), the horizontal/vertical Kanban,
 * one glass topic editor used everywhere, in-app research, and the AI curriculum seed (brain-seed.json).
 * Talks to the main app only through window.LGCore (exposed at the end of index.html's inline script). */
(function () {
  'use strict';
  const K = window.LGCore;
  if (!K) { console.warn('LGCore missing: Brain disabled'); return; }
  const { S, C, put, patch, del, render, toast, md, esc, slug, rid, today, addDays, nowIso, LS } = K;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const LEVELS = ['Foundation', 'Beginner', 'Intermediate', 'Advanced', 'Expert', 'Frontier'];
  const B = { view: LS.get('brainView', matchMedia('(max-width:640px)').matches ? 'kanban' : 'brain'), cat: 'all', find: '',
    sel: null, path: false, showSugg: LS.get('brainSugg', false), wip: Object.assign({ h: 4, v: 1 }, LS.get('brainWip', {})),
    G: null, gkey: '', hi: new Set(), hiL: new Set(), seeding: false, edit: false, more: false };
  window.LGBrain = B;

  /* ------------------------------------------------------------------ helpers */
  const cats = () => [...C('categories').values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const topics = () => [...C('topics').values()].filter(t => !t.hidden);
  const colOf = id => { const c = C('categories').get(id); return (c && c.color) || K.subjColor(id); };
  const catName = id => (C('categories').get(id) || {}).name || id || 'Other';
  const lvl = t => Math.max(0, Math.min(5, Number(t.level ?? 1)));
  const isDue = t => t.status === 'learned' && t.srs && t.srs.due && t.srs.due <= today();
  const done = t => t && t.status === 'learned';
  function lane(t) {
    if (t.status === 'suggested') return 'inbox';
    if (t.status === 'learning') return t.mode === 'v' ? 'vertical' : 'horizontal';
    if (t.status === 'learned') return isDue(t) ? 'review' : 'mastered';
    return 'backlog';
  }
  function missing(t) { const m = (t.prereqs || []).filter(p => C('topics').get(p) && !done(C('topics').get(p))); const par = t.parent && C('topics').get(t.parent); if (par && (par.status === 'todo' || par.status === 'suggested')) m.push(par.id); return m; }
  const ready = t => !missing(t).length;
  function mixHex(hex, k, to = '#06101f') {
    const p = h => { h = String(h || '#8fa8ff').replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
    const a = p(hex), b = p(to); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
  }
  const aiOK = () => { try { if (window.LG && window.LG.ARTIFACT) return !!S.sample; const c = window.LG && window.LG.aiCfg && window.LG.aiCfg(); return !!(S.sample && c && (c.key || c.noKey)); } catch (e) { return false; } };

  /* ------------------------------------------------------------------ status moves */
  const LANES = [
    { id: 'inbox', name: 'Inbox', hint: 'AI suggestions & subtopics. Accept or hide.' },
    { id: 'backlog', name: 'Backlog', hint: 'Everything you plan to learn. 🔓 = prerequisites done.' },
    { id: 'horizontal', name: 'Horizontal · explore', hint: 'Breadth: get the gist of several topics (what, why, where it fits). 30–60 min each.' },
    { id: 'vertical', name: 'Vertical · deep dive', hint: 'Depth: one topic at a time. Read the paper, implement it, build a project, teach it back.' },
    { id: 'review', name: 'Review', hint: 'Spaced repetition: due today. Recall it, then move to Mastered.' },
    { id: 'mastered', name: 'Mastered', hint: 'Learned. Comes back to Review on a growing schedule.' },
  ];
  async function moveTo(t, to) {
    if (!t) return;
    const from = lane(t); if (from === to) return;
    const log = (t.log || []).slice(-79); log.push({ d: today(), a: to });
    const p = { log, hidden: false };
    if (to === 'inbox') Object.assign(p, { status: 'suggested', mode: null });
    else if (to === 'backlog') Object.assign(p, { status: 'todo', mode: null });
    else if (to === 'horizontal' || to === 'vertical') {
      const m = to === 'vertical' ? 'v' : 'h';
      const n = topics().filter(x => x.status === 'learning' && (x.mode === 'v' ? 'v' : 'h') === m && x.id !== t.id).length;
      if (n >= B.wip[m]) toast(`WIP limit: ${n} already in ${to}. Finish one first (limit ${B.wip[m]}, change it in the Kanban header).`, 4200);
      Object.assign(p, { status: 'learning', mode: m, started: t.started || today() });
    } else if (to === 'review') {
      Object.assign(p, { status: 'learned', srs: Object.assign({ interval: 1, ease: 2.3 }, t.srs || {}, { due: today() }) });
    } else if (to === 'mastered') {
      const s = t.srs || null; let srs;
      if (from === 'review' && s) { const next = Math.max(2, Math.round((s.interval || 1) * (s.ease || 2.3))); srs = { interval: next, ease: s.ease || 2.3, due: addDays(today(), next), last: today() }; }
      else srs = s && s.due > today() ? s : { interval: 1, ease: 2.3, due: addDays(today(), 1), last: today() };
      Object.assign(p, { status: 'learned', srs, mode: null });
    }
    await patch('topics', t.id, p);
    if (to === 'mastered' && from !== 'review') { K.recordDone('topic', t.id, t.title, 0); toast('Mastered ✦ Teach it back to lock it in.'); }
    if (from === 'review' && to === 'mastered') toast(`Reviewed. Next review in ${p.srs.interval} days.`);
  }

  /* ------------------------------------------------------------------ curriculum seed */
  async function seed() {
    if (B.seeding || B.seeded) return;
    if (!['topics', 'categories', 'meta'].every(c => S.loaded[c])) return;
    if (C('meta').get('brainSeed')) { B.seeded = true; return; }
    B.seeding = true;
    try {
      const sync = window.LG && window.LG.Sync;
      if (sync && sync.signedIn && sync.signedIn()) { await sync.run(); await new Promise(r => setTimeout(r, 800)); if (C('meta').get('brainSeed')) { B.seeded = true; return; } }
      const d = await (await fetch('brain-seed.json', { cache: 'no-cache' })).json();
      for (const [id, c] of Object.entries(d.categories || {})) if (!C('categories').get(id)) put('categories', id, Object.assign({ created: nowIso() }, c));
      let n = 0;
      for (const [id, t] of Object.entries(d.topics || {})) if (!C('topics').get(id)) { put('topics', id, Object.assign({}, t, { log: [{ d: today(), a: 'added' }], created: nowIso() })); n++; }
      await put('meta', 'brainSeed', { v: d.v || 1, at: nowIso(), topics: n });
      B.seeded = true;
      toast(`Loaded the AI curriculum: ${n} topics across ${Object.keys(d.categories || {}).length} tracks.`, 4500);
    } catch (e) { console.warn('brain seed', e); }
    finally { B.seeding = false; }
  }

  /* ------------------------------------------------------------------ 3D graph */
  function graphData() {
    const cs = cats(); const order = cs.map(c => c.id);
    const ts = topics().filter(t => (B.showSugg || t.status !== 'suggested') && (B.cat === 'all' || t.cat === B.cat));
    const ids = new Set(ts.map(t => t.id));
    const nodes = cs.filter(c => B.cat === 'all' || c.id === B.cat).map(c => ({ id: 'cat:' + c.id, title: c.name, type: 'track', cat: c.id, ring: order.indexOf(c.id), nring: order.length, level: -1 }));
    for (const t of ts) nodes.push({ id: t.id, title: t.title, type: t.kind || 'topic', cat: t.cat, ring: order.indexOf(t.cat), nring: order.length, level: lvl(t), status: t.status, mode: t.mode, why: t.why, nres: (t.resources || []).length, lane: lane(t) });
    const links = []; const seen = new Set();
    const add = (s, t, kind) => { if (s === t) return; const k = s + '>' + t + kind; if (seen.has(k)) return; seen.add(k); links.push({ source: s, target: t, kind }); };
    for (const t of ts) {
      if (t.parent && ids.has(t.parent)) add(t.parent, t.id, 'part');
      else if (nodes.some(n => n.id === 'cat:' + t.cat)) add('cat:' + t.cat, t.id, 'part');
      for (const p of t.prereqs || []) if (ids.has(p)) add(p, t.id, 'prereq');
      for (const r of t.related || []) if (ids.has(r)) add(t.id, r, 'related');
    }
    return { nodes, links };
  }
  function nodeColor(n) {
    const base = colOf(n.cat);
    if (B.hi.size && !B.hi.has(n.id)) return mixHex(base, .86);
    if (n.type === 'track') return base;
    if (n.lane === 'mastered') return '#ffd54a';
    if (n.lane === 'review') return '#ffb547';
    if (n.status === 'learning') return n.mode === 'v' ? '#ffffff' : base;
    if (n.status === 'suggested') return mixHex(base, .7);
    return mixHex(base, .42);
  }
  function ensureGraph() {
    if (B.G || typeof window.ForceGraph3D !== 'function') return B.G;
    const el = $('#brainGraph'); if (!el) return null;
    const R = 430;
    const center = n => { const a = ((n.ring < 0 ? n.nring : n.ring) / Math.max(1, n.nring)) * Math.PI * 2; return { x: Math.cos(a) * R, z: Math.sin(a) * R }; };
    const layout = () => { let ns = []; const f = alpha => { if (B.cat !== 'all') return; for (const n of ns) { const c = center(n); const k = n.type === 'track' ? .5 : .06; n.vx += (c.x - n.x) * k * alpha; n.vz += (c.z - n.z) * k * alpha; const y = n.type === 'track' ? -280 : (n.level - 2.2) * 115; n.vy += (y - n.y) * .2 * alpha; } }; f.initialize = x => { ns = x; }; return f; };
    const G = window.ForceGraph3D({ controlType: 'orbit' })(el)
      .backgroundColor('rgba(0,0,0,0)').nodeId('id').nodeRelSize(4.5).nodeResolution(14).nodeOpacity(.93)
      .nodeVal(n => n.type === 'track' ? 40 : 3 + (n.status === 'learning' ? (n.mode === 'v' ? 9 : 5) : 0) + (n.lane === 'mastered' ? 4 : 0) + Math.min(6, n.nres || 0))
      .nodeColor(nodeColor)
      .nodeLabel(n => `<div class="bg-tip"><b>${esc(n.title)}</b><span>${esc(catName(n.cat))}${n.type === 'track' ? '' : ' · L' + n.level + ' · ' + esc(LANES.find(l => l.id === n.lane)?.name || '')}</span>${n.why ? `<p>${esc(String(n.why).slice(0, 170))}</p>` : ''}</div>`)
      .linkColor(l => B.hiL.size ? (B.hiL.has(l) ? (l.kind === 'prereq' ? '#ffd54a' : '#8fdcff') : 'rgba(80,110,160,.05)') : ({ prereq: 'rgba(255,213,74,.38)', part: 'rgba(94,200,255,.15)', related: 'rgba(255,126,182,.32)' }[l.kind]))
      .linkWidth(l => B.hiL.has(l) ? .9 : l.kind === 'prereq' ? .45 : .2).linkOpacity(.6)
      .linkDirectionalArrowLength(l => l.kind === 'prereq' ? 4 : 0).linkDirectionalArrowRelPos(1)
      .linkDirectionalParticles(l => B.hiL.has(l) ? 3 : 0).linkDirectionalParticleWidth(1.8).linkDirectionalParticleSpeed(.006)
      .onNodeClick(n => n.type === 'track' ? (B.cat = B.cat === n.cat ? 'all' : n.cat, render()) : open(n.id, true))
      .onBackgroundClick(() => { clearHi(); closeDrawer(); })
      .warmupTicks(60).cooldownTime(9000)
      .onEngineStop(() => { if (!B.fitted) { B.fitted = true; G.zoomToFit(700, 30); } });
    G.d3Force('layout', layout());
    G.d3Force('charge').strength(n => n.type === 'track' ? -420 : -55);
    G.d3Force('link').distance(l => l.kind === 'part' ? 70 : 55).strength(l => l.kind === 'part' ? .25 : .08);
    B.G = G; sizeGraph();
    setTimeout(() => G.cameraPosition({ x: 0, y: 320, z: 1080 }, { x: 0, y: 0, z: 0 }, 0), 30);
    window.addEventListener('resize', sizeGraph);
    requestAnimationFrame(labels);
    return G;
  }
  function sizeGraph() { const el = $('#brainGraph'); if (!B.G || !el) return; const r = el.getBoundingClientRect(); B.G.width(Math.max(300, r.width)).height(Math.max(380, r.height)); }
  function refreshGraphStyles() { if (!B.G) return; const G = B.G; G.nodeColor(G.nodeColor()); G.linkColor(G.linkColor()).linkWidth(G.linkWidth()).linkDirectionalParticles(G.linkDirectionalParticles()); }
  function updateGraph() {
    const G = ensureGraph(); if (!G) return;
    const d = graphData();
    const key = B.cat + '|' + B.showSugg + '|' + d.nodes.map(n => n.id + n.status + (n.mode || '') + n.lane + n.level + n.cat).join(',') + '|' + d.links.length;
    if (key === B.gkey) return; B.gkey = key;
    const old = new Map(G.graphData().nodes.map(n => [n.id, n]));
    for (const n of d.nodes) { const o = old.get(n.id); if (o) Object.assign(n, { x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz }); }
    G.graphData(d); if (B.fitted && d.nodes.length < 40) { B.fitted = false; }
    if (B.sel) highlight(B.sel, B.path);
  }
  function labels() {
    const G = B.G, box = $('#brainLabels');
    if (G && box && S.tab === 'galaxy' && B.view === 'brain') {
      const W = box.clientWidth, H = box.clientHeight; let h = '';
      for (const n of G.graphData().nodes) {
        if (n.x === undefined) continue;
        const show = n.type === 'track' || n.id === B.sel || n.status === 'learning' || (B.hi.size && B.hi.has(n.id) && B.hi.size < 40);
        if (!show) continue;
        const p = G.graph2ScreenCoords(n.x, n.y, n.z); if (p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) continue;
        h += `<div class="bl ${n.type === 'track' ? 'trk' : ''} ${n.id === B.sel ? 'sel' : ''}" style="left:${p.x}px;top:${p.y}px;${n.type === 'track' ? 'color:' + colOf(n.cat) : ''}">${esc(n.title)}${n.mode === 'v' && n.status === 'learning' ? ' ⬇' : ''}</div>`;
      }
      box.innerHTML = h;
    }
    requestAnimationFrame(labels);
  }
  function highlight(id, path) {
    if (!B.G) return; const L = B.G.graphData().links; const set = new Set([id]), ls = new Set();
    const sid = l => (l.source && l.source.id) || l.source, tid = l => (l.target && l.target.id) || l.target;
    if (path) { const st = [id]; while (st.length) { const cur = st.pop(); for (const l of L) if (l.kind === 'prereq' && tid(l) === cur) { ls.add(l); if (!set.has(sid(l))) { set.add(sid(l)); st.push(sid(l)); } } } }
    else for (const l of L) if (sid(l) === id || tid(l) === id) { set.add(sid(l)); set.add(tid(l)); ls.add(l); }
    B.hi = set; B.hiL = ls; refreshGraphStyles();
  }
  function clearHi() { B.sel = null; B.path = false; B.hi = new Set(); B.hiL = new Set(); refreshGraphStyles(); }
  function fly(id) {
    if (!B.G) return; const n = B.G.graphData().nodes.find(x => x.id === id); if (!n || n.x === undefined) return;
    const r = Math.hypot(n.x, n.y, n.z) || 1, d = 420;
    B.G.cameraPosition({ x: n.x * (1 + d / r), y: n.y * (1 + d / r) + 40, z: n.z * (1 + d / r) }, n, 1100);
  }

  /* ------------------------------------------------------------------ views */
  function shell() {
    const host = $('#brainHost'); if (!host || host.dataset.ok) return;
    host.dataset.ok = '1';
    host.innerHTML = `
      <div class="bz-bar glass">
        <div class="bz-views" role="tablist">
          <button data-bv="brain">◉ 3D Brain</button><button data-bv="kanban">▦ Kanban</button><button data-bv="overview">☰ Overview</button>
        </div>
        <form class="bz-rs" id="bzRs" autocomplete="off"><input class="inp" id="bzRsIn" placeholder="Research a topic… e.g. GRPO, MCP servers, LoRA rank">
          <button class="btn primary" type="submit" title="Research now in the app (web sources + your AI key)">Research</button>
          <button class="btn" type="button" id="bzDeep" title="Queue a deep, cited research run for the daily Claude job">Deep ⌕</button></form>
        <input class="inp" id="bzFind" type="search" placeholder="Find…" autocomplete="off">
        <button class="btn" id="bzNew" title="New topic">＋ Topic</button>
      </div>
      <div class="bz-cats" id="bzCats"></div>
      <div id="bzBrain" class="bz-stage glass-soft"><div id="brainGraph"></div><div id="brainLabels"></div>
        <div class="bz-legend glass"><span><i style="background:#2b4a6e"></i>Backlog</span><span><i style="background:var(--accent)"></i>Horizontal</span><span><i style="background:#fff"></i>Vertical</span><span><i style="background:#ffb547"></i>Review</span><span><i style="background:#ffd54a"></i>Mastered</span><span class="faint">Ring = breadth · height = depth · ⟶ yellow = learn first</span>
          <label><input type="checkbox" id="bzSugg"> suggestions</label></div>
        <div class="bz-hits glass" id="bzHits" hidden></div>
      </div>
      <div id="bzKanban"></div>`;
    $$('[data-bv]', host).forEach(b => b.onclick = () => { B.view = b.dataset.bv; LS.set('brainView', B.view); render(); });
    $('#bzRs').onsubmit = e => { e.preventDefault(); const v = $('#bzRsIn').value.trim(); if (!v) return; $('#bzRsIn').value = ''; quickResearch(v); };
    $('#bzDeep').onclick = () => { const v = $('#bzRsIn').value.trim(); if (!v) return toast('Type a topic first.'); $('#bzRsIn').value = ''; deepResearch(v); };
    $('#bzNew').onclick = () => newTopic();
    $('#bzSugg').onchange = e => { B.showSugg = e.target.checked; LS.set('brainSugg', B.showSugg); render(); };
    $('#bzFind').oninput = e => { B.find = e.target.value.trim().toLowerCase(); drawHits(); if (B.view === 'kanban') drawKanban(); };
  }
  function drawHits() {
    const box = $('#bzHits'); if (!box) return;
    if (!B.find || B.view !== 'brain') { box.hidden = true; return; }
    const hits = topics().filter(t => (t.title + ' ' + (t.why || '')).toLowerCase().includes(B.find)).slice(0, 12);
    box.innerHTML = hits.map(t => `<button data-go="${esc(t.id)}"><b>${esc(t.title)}</b><span>${esc(catName(t.cat))}</span></button>`).join('') || `<button data-rs="${esc(B.find)}"><b>Not in your brain yet</b><span>Research “${esc(B.find)}”</span></button>`;
    box.hidden = false;
    $$('[data-go]', box).forEach(b => b.onclick = () => { box.hidden = true; open(b.dataset.go, true); });
    $$('[data-rs]', box).forEach(b => b.onclick = () => { box.hidden = true; quickResearch(b.dataset.rs); });
  }
  function drawCats() {
    const box = $('#bzCats'); if (!box) return; const ts = topics().filter(t => t.status !== 'suggested');
    const chip = (id, name, col, n, m) => `<button class="bz-cat ${B.cat === id ? 'on' : ''}" data-cat="${esc(id)}" style="--c:${col}"><i></i>${esc(name)}<small>${m}/${n}</small></button>`;
    box.innerHTML = chip('all', 'All tracks', 'var(--accent)', ts.length, ts.filter(done).length) +
      cats().map(c => { const x = ts.filter(t => t.cat === c.id); return x.length ? chip(c.id, c.name, colOf(c.id), x.length, x.filter(done).length) : ''; }).join('');
    $$('[data-cat]', box).forEach(b => b.onclick = () => { B.cat = b.dataset.cat; render(); });
  }

  /* -------- Kanban (horizontal / vertical method) */
  function tshape() {
    const ts = topics().filter(t => t.status !== 'suggested');
    return '<div class="ts">' + cats().map(c => { const x = ts.filter(t => t.cat === c.id); if (!x.length) return '';
      const b = x.filter(t => t.status === 'learning' || t.status === 'learned').length / x.length;
      const d = Math.max(-1, ...x.filter(done).map(lvl)), g = Math.max(-1, ...x.filter(t => t.status === 'learning' && t.mode === 'v').map(lvl));
      const col = colOf(c.id), pct = v => v < 0 ? 0 : Math.round((v + 1) / 6 * 100);
      return `<div class="ts-c" style="--c:${col}" title="${esc(c.name)}: ${Math.round(b * 100)}% explored · deepest mastered: ${d < 0 ? 'none yet' : LEVELS[d]}${g > d ? ' · diving into ' + LEVELS[g] : ''}">
        <div class="ts-b"><i style="width:${Math.round(b * 100)}%"></i></div>
        <div class="ts-v">${g > d ? `<i class="go" style="height:${pct(g)}%"></i>` : ''}<i style="height:${pct(d)}%"></i></div>
        <span>${esc(c.name.split(/[ &]/)[0].slice(0, 9))}</span></div>`; }).join('') + '</div>';
  }
  function card(t) {
    const miss = missing(t); const col = colOf(t.cat);
    return `<div class="kb-card ${B.sel === t.id ? 'sel' : ''}" draggable="true" data-t="${esc(t.id)}" style="--c:${col}">
      <div class="kb-t">${esc(t.title)}</div>
      <div class="kb-m"><span class="dot" style="--c:${col}"></span>${esc(catName(t.cat))}<span class="kb-l">L${lvl(t)}</span>${lane(t) === 'backlog' ? (miss.length ? `<span title="Learn first: ${esc(miss.map(p => (C('topics').get(p) || {}).title).join(', '))}">🔒${miss.length}</span>` : '<span title="Prerequisites done">🔓</span>') : ''}${(t.resources || []).length ? `<span>${t.resources.length}↗</span>` : ''}${(t.cards || []).length ? `<span>${t.cards.length}▢</span>` : ''}</div></div>`;
  }
  function drawKanban() {
    const box = $('#bzKanban'); if (!box) return;
    const sx = $('.kb-board', box)?.scrollLeft || 0, ly = Object.fromEntries($$('.kb-lane', box).map(l => [l.dataset.lane, $('.kb-list', l).scrollTop]));
    const f = B.find; const ts = topics().filter(t => (B.cat === 'all' || t.cat === B.cat) && (!f || t.title.toLowerCase().includes(f)));
    const by = {}; for (const L of LANES) by[L.id] = [];
    for (const t of ts) by[lane(t)].push(t);
    by.backlog.sort((a, b) => (missing(a).length ? 1 : 0) - (missing(b).length ? 1 : 0) || (b.priority || 2) - (a.priority || 2) || lvl(a) - lvl(b) || String(a.title).localeCompare(b.title));
    by.inbox.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
    const hN = topics().filter(t => lane(t) === 'horizontal').length, vN = topics().filter(t => lane(t) === 'vertical').length;
    const lanes = LANES.filter(L => L.id !== 'inbox' || by.inbox.length || B.showSugg);
    box.innerHTML = `<div class="kb-top glass">
        <div class="kb-method"><div class="label">Horizontal × vertical learning</div>
          <p><b>Horizontal</b> = breadth: skim several topics across tracks so you know what exists and how it connects. <b>Vertical</b> = depth: one topic, all the way down — paper, code, project, teach-back. Alternate: explore wide, then pick one to go deep.</p>
          <div class="row"><button class="btn small primary" id="kbPlan">✦ Plan my next moves</button>
            <label class="small">H limit <input class="inp kb-wip" id="kbWh" type="number" min="1" max="12" value="${B.wip.h}"></label>
            <label class="small">V limit <input class="inp kb-wip" id="kbWv" type="number" min="1" max="5" value="${B.wip.v}"></label>
            <span class="faint small">Now: ${hN} horizontal · ${vN} vertical · ${by.review.length} to review</span></div></div>
        <div class="kb-tshape"><div class="label">Your T-shape · bar = breadth explored, column = depth mastered</div>${tshape()}</div></div>
      <div class="kb-board">${lanes.map(L => { const list = by[L.id]; const cap = L.id === 'backlog' && !B.more ? 30 : L.id === 'mastered' && !B.more ? 30 : 999;
        const over = (L.id === 'horizontal' && list.length > B.wip.h) || (L.id === 'vertical' && list.length > B.wip.v);
        return `<section class="kb-lane glass ${over ? 'over-wip' : ''}" data-lane="${L.id}"><header><div><h4>${L.name}</h4><span class="faint">${L.hint}</span></div><b class="mono">${list.length}${L.id === 'horizontal' ? '/' + B.wip.h : L.id === 'vertical' ? '/' + B.wip.v : ''}</b></header>
          <div class="kb-list">${list.slice(0, cap).map(card).join('') || '<div class="faint small kb-empty">Drop a topic here</div>'}${list.length > cap ? `<button class="btn small ghost" data-kbmore>+ ${list.length - cap} more</button>` : ''}</div></section>`; }).join('')}</div>`;
    const bd = $('.kb-board', box); if (bd) bd.scrollLeft = sx; $$('.kb-lane', box).forEach(l => { if (ly[l.dataset.lane]) $('.kb-list', l).scrollTop = ly[l.dataset.lane]; });
    $('.kb-card', box).forEach(c => { c.onclick = () => open(c.dataset.t); c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.t); c.classList.add('drag'); }; c.ondragend = () => c.classList.remove('drag'); });
    $$('.kb-lane', box).forEach(l => { l.ondragover = e => { e.preventDefault(); l.classList.add('over'); }; l.ondragleave = () => l.classList.remove('over');
      l.ondrop = e => { e.preventDefault(); l.classList.remove('over'); moveTo(C('topics').get(e.dataTransfer.getData('text/plain')), l.dataset.lane); }; });
    $$('[data-kbmore]', box).forEach(b => b.onclick = () => { B.more = true; drawKanban(); });
    $('#kbPlan').onclick = planMoves;
    const wip = () => { B.wip = { h: Math.max(1, +$('#kbWh').value || 4), v: Math.max(1, +$('#kbWv').value || 1) }; LS.set('brainWip', B.wip); drawKanban(); };
    $('#kbWh').onchange = wip; $('#kbWv').onchange = wip;
  }
  function planMoves() {
    const all = topics().filter(t => t.status !== 'suggested');
    const hNow = all.filter(t => lane(t) === 'horizontal'), vNow = all.filter(t => lane(t) === 'vertical');
    const cand = all.filter(t => lane(t) === 'backlog' && ready(t));
    const explored = c => all.filter(t => t.cat === c && (t.status === 'learning' || t.status === 'learned')).length;
    const picks = [];
    if (vNow.length < B.wip.v) {
      // go deep where you already have breadth: an explored-or-horizontal topic, else the lowest ready topic in your strongest track
      const fromH = hNow.slice().sort((a, b) => lvl(a) - lvl(b))[0];
      const strong = cand.slice().sort((a, b) => explored(b.cat) - explored(a.cat) || lvl(a) - lvl(b))[0];
      const v = fromH || strong; if (v) picks.push({ t: v, to: 'vertical', why: fromH ? 'You explored it already: now go deep.' : 'Next level in a track you know.' });
    }
    const used = new Set(picks.map(p => p.t.id)); const usedCats = new Set(hNow.map(t => t.cat));
    const hs = cand.filter(t => !used.has(t.id)).sort((a, b) => explored(a.cat) - explored(b.cat) || lvl(a) - lvl(b));
    for (const t of hs) { if (hNow.length + picks.filter(p => p.to === 'horizontal').length >= B.wip.h) break; if (usedCats.has(t.cat)) continue; usedCats.add(t.cat); picks.push({ t, to: 'horizontal', why: `Breadth gap in ${catName(t.cat)}.` }); }
    const rev = all.filter(t => lane(t) === 'review').length;
    if (!picks.length) return toast(rev ? `Nothing new to start: clear your ${rev} review(s) first.` : 'Your lanes are full. Finish something first.');
    openModal(`<div class="label">Plan my next moves</div><h3>Suggested moves</h3><p class="faint" style="font-size:13.5px">Based on prerequisites, your WIP limits (H ${B.wip.h} · V ${B.wip.v}) and where your T-shape is thin.${rev ? ` You also have <b>${rev}</b> review(s) due.` : ''}</p>
      <div class="stack">${picks.map((p, i) => `<label class="kb-pick"><input type="checkbox" class="check" data-pk="${i}" checked><span><b>${esc(p.t.title)}</b> → ${p.to === 'vertical' ? 'Vertical · deep dive' : 'Horizontal · explore'}<br><span class="faint">${esc(catName(p.t.cat))} · L${lvl(p.t)} · ${esc(p.why)}</span></span></label>`).join('')}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="pkGo">Apply</button></div>`, () => {
      $('#pkGo').onclick = async () => { for (const b of $$('[data-pk]')) if (b.checked) { const p = picks[+b.dataset.pk]; await moveTo(C('topics').get(p.t.id), p.to); } closeModal(); toast('Lanes updated.'); };
    });
  }

  /* ------------------------------------------------------------------ the topic drawer (editor) */
  function closeDrawer() { const d = $('#bdrawer'); if (d) d.hidden = true; B.edit = false; }
  function drawerEl() {
    let d = $('#bdrawer'); if (d) return d;
    d = document.createElement('aside'); d.id = 'bdrawer'; d.className = 'bdrawer glass'; d.hidden = true; document.body.appendChild(d);
    return d;
  }
  function open(id, flyTo) {
    const t = C('topics').get(id); if (!t) return;
    B.sel = id; B.path = false; if (B.G) { highlight(id); if (flyTo && S.tab === 'galaxy' && B.view === 'brain') fly(id); }
    drawDrawer();
  }
  B.open = id => open(id, true);
  function chipList(ids, kind) {
    return (ids || []).map(i => { const x = C('topics').get(i); return x ? `<span class="chip ${done(x) ? 'ok' : ''}"><a data-go="${esc(i)}">${esc(x.title)}</a>${kind ? `<button data-rm="${kind}" data-v="${esc(i)}" title="Remove">×</button>` : ''}</span>` : ''; }).join('');
  }
  function drawDrawer() {
    const t = C('topics').get(B.sel); const d = drawerEl(); if (!t) { d.hidden = true; return; }
    const L = lane(t), col = colOf(t.cat);
    const kids = topics().filter(x => x.parent === t.id);
    const unlocks = topics().filter(x => (x.prereqs || []).includes(t.id));
    const dossier = [...C('research').values()].filter(r => r.topic === t.id || (r.query || '').toLowerCase() === t.title.toLowerCase()).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
    d.style.setProperty('--c', col); const keepTop = d.dataset.for === t.id ? d.scrollTop : 0; d.dataset.for = t.id;
    const openDet = new Set($$('details[open]', d).map(x => x.querySelector('summary')?.textContent));
    d.innerHTML = `<button class="iconbtn bd-x" id="bdX" aria-label="Close">×</button>
      <input class="bd-title" id="bdTitle" value="${esc(t.title)}" aria-label="Title">
      <div class="bd-meta">
        <select class="sel" id="bdCat">${cats().map(c => `<option value="${esc(c.id)}" ${c.id === t.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select class="sel" id="bdLvl">${LEVELS.map((n, i) => `<option value="${i}" ${i === lvl(t) ? 'selected' : ''}>L${i} ${n}</option>`).join('')}</select>
        <select class="sel" id="bdPri"><option value="1" ${t.priority == 1 ? 'selected' : ''}>low</option><option value="2" ${(t.priority || 2) == 2 ? 'selected' : ''}>normal</option><option value="3" ${t.priority == 3 ? 'selected' : ''}>high priority</option></select>
      </div>
      <div class="bd-lanes">${LANES.map(x => `<button class="btn small ${x.id === L ? 'on' : ''}" data-mv="${x.id}">${x.name.split(' ·')[0]}</button>`).join('')}</div>
      <textarea class="inp bd-why" id="bdWhy" rows="2" placeholder="One-line summary">${esc(t.why || '')}</textarea>
      <div class="bd-act">
        <button class="btn small primary" id="bdRs">⟳ Research</button><button class="btn small" id="bdDeep">Deep ⌕</button>
        <button class="btn small" id="bdTb">Teach back</button><button class="btn small" id="bdBt">⚔ Sim</button><button class="btn small" id="bdFocus">◷ Focus</button>
        <button class="btn small" id="bdCourse">▶ Course</button><button class="btn small" id="bdAsk">Ask ${esc(K.aiName ? K.aiName() : 'Jarvis')}</button><button class="btn small" id="bdPath">${B.path ? 'Neighbours' : 'Show path'}</button>
      </div>
      <div class="bd-links">
        <div><span class="label">Learn first</span>${chipList(t.prereqs, 'prereqs')}<input class="inp bd-add" list="bdAll" data-add="prereqs" placeholder="+ prerequisite"></div>
        <div><span class="label">Related</span>${chipList(t.related, 'related')}<input class="inp bd-add" list="bdAll" data-add="related" placeholder="+ related"></div>
        ${t.parent ? `<div><span class="label">Part of</span>${chipList([t.parent])}</div>` : ''}
        ${unlocks.length ? `<div><span class="label">Unlocks</span>${chipList(unlocks.map(x => x.id))}</div>` : ''}
        ${kids.length ? `<div><span class="label">Inside</span>${chipList(kids.map(x => x.id))}</div>` : ''}
        <datalist id="bdAll">${topics().filter(x => x.id !== t.id).map(x => `<option value="${esc(x.title)}"></option>`).join('')}</datalist>
      </div>
      <div class="bd-sec"><div class="row" style="justify-content:space-between"><span class="label">Explanation</span><button class="btn small ghost" id="bdEdit">${B.edit ? 'Preview' : '✎ Edit'}</button></div>
        ${B.edit ? `<textarea class="inp bd-md" id="bdExplain" rows="16">${esc(t.explain || '')}</textarea>` : `<div class="md bd-explain">${t.explain ? md(String(t.explain).replace(/^\s*##\s*Explanation\s*\n/, '')) : '<p class="faint">Nothing yet. Hit <b>Research</b> or write your own (✎ Edit).</p>'}</div>`}</div>
      ${dossier && dossier.dossier ? `<details class="bd-sec"><summary class="label">Deep research dossier · ${esc(dossier.status || '')}</summary><div class="md">${dossier.dossier.summary ? `<p><b>${esc(dossier.dossier.summary)}</b></p>` : ''}${md(dossier.dossier.what || '')}</div></details>` : dossier ? `<p class="faint small">Deep research queued (${esc(dossier.status || 'pending')}).</p>` : ''}
      <div class="bd-sec"><span class="label">My notes</span><textarea class="inp" id="bdNotes" rows="5" placeholder="Explain it in your own words…">${esc(t.notes || '')}</textarea></div>
      <div class="bd-sec"><span class="label">Resources</span>
        <div class="bd-res">${(t.resources || []).map((r, i) => `<div class="bd-r"><span class="kind">${esc(r.kind || 'link')}</span><a href="${esc(K.safeUrl(r.url))}" target="_blank" rel="noopener">${esc(r.label || r.url)}</a>${r.year ? `<span class="faint">${esc(r.year)}</span>` : ''}<button class="x" data-rres="${i}" title="Remove">×</button></div>`).join('') || '<p class="faint small">None yet.</p>'}</div>
        <form class="row bd-addres" id="bdAddRes"><input class="inp" id="bdResL" placeholder="Title"><input class="inp" id="bdResU" placeholder="https://…" type="url"><button class="btn small">Add</button></form></div>
      <div class="bd-sec"><div class="row" style="justify-content:space-between"><span class="label">Flashcards (${(t.cards || []).length})</span><button class="btn small ghost" id="bdCards">${aiOK() ? '✦ Generate' : ''}</button></div>
        ${(t.cards || []).map((c, i) => `<details class="bd-card"><summary>${esc(c.q)}<button class="x" data-rcard="${i}">×</button></summary><p>${esc(c.a)}</p></details>`).join('')}
        <form class="stack bd-addcard" id="bdAddCard"><input class="inp" id="bdCq" placeholder="Question"><input class="inp" id="bdCa" placeholder="Answer"><button class="btn small">Add card</button></form></div>
      <div class="row bd-foot"><span class="faint small">${t.source === 'brain' ? 'AI curriculum' : t.source === 'me' ? 'Added by you' : esc(t.source || '')}${t.researched ? ' · researched ' + esc(t.researched) : ''}</span><button class="btn small ghost" id="bdDel">Delete</button></div>`;
    d.hidden = false; d.scrollTop = keepTop; $$('details', d).forEach(x => { if (openDet.has(x.querySelector('summary')?.textContent)) x.open = true; });
    const save = p => patch('topics', t.id, p);
    $('#bdX').onclick = () => { closeDrawer(); clearHi(); };
    $('#bdTitle').onchange = e => { const v = e.target.value.trim(); if (v) save({ title: v.slice(0, 120) }); };
    $('#bdCat').onchange = e => save({ cat: e.target.value });
    $('#bdLvl').onchange = e => save({ level: +e.target.value });
    $('#bdPri').onchange = e => save({ priority: +e.target.value });
    $('#bdWhy').onchange = e => save({ why: e.target.value.trim() });
    let nt; $('#bdNotes').oninput = e => { clearTimeout(nt); nt = setTimeout(() => save({ notes: e.target.value }), 600); };
    $$('[data-mv]', d).forEach(b => b.onclick = async () => { await moveTo(t, b.dataset.mv); setTimeout(drawDrawer, 120); });
    $('#bdEdit').onclick = async () => { if (B.edit) { await save({ explain: $('#bdExplain').value }); } B.edit = !B.edit; drawDrawer(); };
    $$('[data-go]', d).forEach(a => a.onclick = () => open(a.dataset.go, true));
    $$('[data-rm]', d).forEach(b => b.onclick = () => { const k = b.dataset.rm; save({ [k]: (t[k] || []).filter(x => x !== b.dataset.v) }); setTimeout(drawDrawer, 120); });
    $$('[data-add]', d).forEach(inp => inp.onchange = () => { const v = inp.value.trim().toLowerCase(); const x = topics().find(y => y.title.toLowerCase() === v); if (!x) return toast('Pick an existing topic from the list.'); const k = inp.dataset.add; save({ [k]: [...new Set([...(t[k] || []), x.id])] }); setTimeout(drawDrawer, 120); });
    $$('[data-rres]', d).forEach(b => b.onclick = () => { save({ resources: (t.resources || []).filter((_, i) => i !== +b.dataset.rres) }); setTimeout(drawDrawer, 120); });
    $('#bdAddRes').onsubmit = e => { e.preventDefault(); const u = $('#bdResU').value.trim(); if (!/^https?:\/\//.test(u)) return toast('Paste a full https:// link.'); save({ resources: [...(t.resources || []), { label: $('#bdResL').value.trim() || u, url: u, kind: 'link' }] }); setTimeout(drawDrawer, 120); };
    $$('[data-rcard]', d).forEach(b => b.onclick = e => { e.preventDefault(); save({ cards: (t.cards || []).filter((_, i) => i !== +b.dataset.rcard) }); setTimeout(drawDrawer, 120); });
    $('#bdAddCard').onsubmit = e => { e.preventDefault(); const q = $('#bdCq').value.trim(), a = $('#bdCa').value.trim(); if (!q || !a) return; save({ cards: [...(t.cards || []), { q, a }] }); setTimeout(drawDrawer, 120); };
    $('#bdCards').onclick = () => aiOK() ? genCards(t) : null;
    $('#bdRs').onclick = () => quickResearch(t.title, t.id);
    $('#bdDeep').onclick = () => deepResearch(t.title, t.id);
    $('#bdTb').onclick = () => K.teachBack(t.title, t.explain || '');
    $('#bdBt').onclick = () => K.startBattle(t.title, String(t.explain || '').slice(0, 800));
    $('#bdFocus').onclick = () => K.focusPicker(t.title, 'topic:' + t.id, 25);
    $('#bdCourse').onclick = () => K.createCourse(t.title + (t.notes ? ' — ' + t.notes : ''), 'intermediate', 45);
    $('#bdAsk').onclick = () => { K.openJarvis(); K.jarvisAsk(`Explain "${t.title}" simply with one example, then how it connects to what I already know.`); };
    $('#bdPath').onclick = () => { if (S.tab !== 'galaxy' || B.view !== 'brain') { B.view = 'brain'; LS.set('brainView', 'brain'); K.setTab('galaxy'); } B.path = !B.path; setTimeout(() => { highlight(t.id, B.path); drawDrawer(); }, 200); };
    $('#bdDel').onclick = () => K.confirmBox(`Delete “${esc(t.title)}”? Its notes and cards go too.`, 'Delete', () => { del('topics', t.id); closeDrawer(); clearHi(); });
  }

  /* ------------------------------------------------------------------ create + research */
  function newTopic(title = '') {
    openModal(`<div class="label">New topic</div><h3>Add to your brain</h3>
      <div class="field"><span class="label">Title</span><input class="inp" id="ntT" value="${esc(title)}"></div>
      <div class="row"><select class="sel" id="ntC">${cats().map(c => `<option value="${esc(c.id)}" ${c.id === (B.cat !== 'all' ? B.cat : 'frontier') ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select class="sel" id="ntL">${LEVELS.map((n, i) => `<option value="${i}" ${i === 2 ? 'selected' : ''}>L${i} ${n}</option>`).join('')}</select></div>
      <label class="row small"><input type="checkbox" class="check" id="ntR" ${aiOK() ? 'checked' : ''}> Research it right away</label>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ntGo">Add</button></div>`, () => {
      $('#ntGo').onclick = async () => { const v = $('#ntT').value.trim(); if (!v) return; const id = slug(v) + '-' + rid();
        await put('topics', id, { title: v.slice(0, 120), cat: $('#ntC').value, level: +$('#ntL').value, status: 'todo', source: 'me', priority: 2, parent: null, prereqs: [], related: [], notes: '', explain: '', why: '', cards: [], resources: [], srs: null, log: [{ d: today(), a: 'added' }], created: nowIso() });
        closeModal(); open(id, true); if ($('#ntR') && $('#ntR').checked) quickResearch(v, id); };
    });
  }
  async function deepResearch(title, id) {
    const tid = id || findId(title);
    await put('research', slug(title) + '-' + rid(), { query: title, mode: 'learn', topic: tid || null, note: 'From the Brain: also update the linked topic (explain, resources, cards).', status: 'pending', created: nowIso(), history: [] });
    const ok = await K.fireBot('daily');
    toast(ok ? 'Deep research started. The dossier lands here in a few minutes.' : 'Deep research queued for the next daily Claude run.', 4200);
  }
  function findId(title) { const v = String(title).toLowerCase(); const t = topics().find(x => x.title.toLowerCase() === v) || topics().find(x => new RegExp('(^|[^a-z0-9])' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(x.title.toLowerCase())); return t ? t.id : null; }
  const j = async (url, o = {}) => { const r = await fetch(url, o); if (!r.ok) throw new Error(r.status); return r.json(); };
  const SRC = {
    async wikipedia(q) { const s = await j('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=2&srsearch=' + encodeURIComponent(q));
      const out = []; for (const h of (s.query?.search || []).slice(0, 2)) { try { const p = await j('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(h.title.replace(/ /g, '_'))); if (p.extract) out.push({ label: 'Wikipedia: ' + h.title, url: p.content_urls?.desktop?.page, kind: 'article', text: p.extract }); } catch (e) {} } return out; },
    async arxiv(q) { const u = 'https://export.arxiv.org/api/query?max_results=6&sortBy=relevance&search_query=' + encodeURIComponent(`all:"${q}" AND (cat:cs.LG OR cat:cs.CL OR cat:cs.AI OR cat:cs.CV OR cat:stat.ML OR cat:cs.MA)`);
      const r = await fetch('/api/research-proxy?u=' + encodeURIComponent(u)); if (!r.ok) throw new Error(r.status); const x = new DOMParser().parseFromString(await r.text(), 'application/xml');
      return [...x.querySelectorAll('entry')].map(e => ({ label: e.querySelector('title').textContent.replace(/\s+/g, ' ').trim(), url: e.querySelector('id').textContent.replace(/^http:/, 'https:').replace(/v\d+$/, ''), kind: 'paper', year: (e.querySelector('published')?.textContent || '').slice(0, 4), text: e.querySelector('summary').textContent.replace(/\s+/g, ' ').slice(0, 700) })); },
    async scholar(q) { const d = await j('https://api.semanticscholar.org/graph/v1/paper/search?limit=8&fields=title,url,year,citationCount,abstract,externalIds&query=' + encodeURIComponent(q));
      return (d.data || []).sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0)).slice(0, 4).map(p => ({ label: p.title, url: p.externalIds?.ArXiv ? 'https://arxiv.org/abs/' + p.externalIds.ArXiv : p.url, kind: 'paper', year: String(p.year || ''), text: (p.abstract || '').slice(0, 600) + ` (${p.citationCount || 0} citations)` })); },
    async github(q) { const d = await j('https://api.github.com/search/repositories?sort=stars&order=desc&per_page=5&q=' + encodeURIComponent(q));
      return (d.items || []).slice(0, 5).map(r => ({ label: `${r.full_name} (${r.stargazers_count.toLocaleString()}★)`, url: r.html_url, kind: 'repo', text: r.description || '' })); },
    async hn(q) { const since = Math.floor(Date.now() / 1000) - 365 * 864e2; const d = await j(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&numericFilters=created_at_i>${since},points>40&query=` + encodeURIComponent(q));
      return (d.hits || []).map(h => ({ label: h.title, url: h.url || 'https://news.ycombinator.com/item?id=' + h.objectID, kind: 'news', text: `${h.points} points on HN, ${String(h.created_at).slice(0, 10)}` })); },
    async hf(q) { const d = await j('https://huggingface.co/api/models?sort=downloads&direction=-1&limit=3&search=' + encodeURIComponent(q));
      return (Array.isArray(d) ? d : []).map(m => ({ label: 'HF model: ' + m.id, url: 'https://huggingface.co/' + m.id, kind: 'model', text: `${(m.downloads || 0).toLocaleString()} downloads` })); },
  };
  B.busy = new Set();
  async function quickResearch(title, id) {
    const key = (id || title).toLowerCase(); if (B.busy.has(key)) return toast('Already researching that.'); B.busy.add(key);
    toast(`Researching “${title}”…`, 6000);
    try {
      const got = await Promise.all(Object.entries(SRC).map(async ([k, f]) => { try { return await f(title); } catch (e) { console.warn('research', k, e); return []; } }));
      const sources = got.flat().filter(s => s && s.url);
      let tid = id || findId(title); let t = tid && C('topics').get(tid);
      const brief = topics().map(x => `${x.id} | ${x.title} | ${x.cat} | L${lvl(x)}`).join('\n').slice(0, 9000);
      let syn = null;
      if (aiOK()) {
        S.feat = 'Brain research';
        try {
          syn = await S.sample.json(`You are the research engine of a learner's AI knowledge graph (learning AI broad and deep: Python → ML → deep learning → RL → transformers → LLM internals → fine-tuning/small models → agentic AI).
Topic: ${title}
SOURCES (cite by [index]):
${sources.map((s, i) => `[${i}] (${s.kind}${s.year ? ', ' + s.year : ''}) ${s.label}\n${(s.text || '').slice(0, 500)}`).join('\n').slice(0, 14000)}
EXISTING NODES (id | title | track | level):
${brief}
Tracks: ${cats().map(c => c.id).join(', ')}. Levels 0 foundation … 5 frontier (last ~12 months).
Reply with JSON only: {"title":"canonical name","summary":"1-2 sentences","explanation":"markdown 250-450 words: intuition first, how it works (tiny formula or pseudo-code if useful), why it matters, pitfalls; cite like [3]","key_ideas":["..."],"track":"track id","level":0-5,"parent":"existing id or empty","prereqs":["existing ids"],"related":["existing ids"],"subtopics":[{"title":"...","summary":"...","level":0-5}],"learning_steps":["ordered steps ending with a small hands-on Python exercise"],"cards":[{"q":"question","a":"short answer"}],"best_sources":[indexes, best first, max 8],"whats_new":"recent developments if the sources show any, else empty"}
Never invent URLs; only use the given sources.`, { modelTier: 'default' });
        } catch (e) { console.warn('brain synth', e); toast('AI synthesis failed; saved the sources only.'); }
      }
      const valid = new Set(topics().map(x => x.id));
      const pick = syn && Array.isArray(syn.best_sources) ? syn.best_sources.filter(i => sources[i]).map(i => sources[i]) : [];
      const res = [...pick, ...sources.filter(s => !pick.includes(s))].slice(0, 12).map(s => ({ label: s.label, url: s.url, kind: s.kind, ...(s.year ? { year: s.year } : {}) }));
      let explain = '';
      if (syn && syn.explanation) {
        explain = '## Explanation\n\n' + String(syn.explanation).replace(/\[(\d{1,2})\]/g, (m, i) => sources[+i] ? `[[${i}]](${sources[+i].url})` : m);
        if ((syn.key_ideas || []).length) explain += '\n\n**Key ideas**\n' + syn.key_ideas.map(k => '- ' + k).join('\n');
        if ((syn.learning_steps || []).length) explain += '\n\n## Learning steps\n\n' + syn.learning_steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
        if (syn.whats_new) explain += `\n\n## What's new\n\n${syn.whats_new}`;
      } else {
        const w = sources.find(s => s.kind === 'article'); if (w) explain = `## Background\n\n${w.text}\n\n_Source: [${w.label}](${w.url})_`;
      }
      const base = {
        why: (syn && syn.summary) || (t && t.why) || '', researched: today(), confidence: syn ? 'medium' : 'low',
        resources: dedupe([...(t ? t.resources || [] : []), ...res]),
        prereqs: [...new Set([...(t ? t.prereqs || [] : []), ...((syn && syn.prereqs) || []).filter(x => valid.has(x) && x !== tid)])],
        related: [...new Set([...(t ? t.related || [] : []), ...((syn && syn.related) || []).filter(x => valid.has(x) && x !== tid)])],
      };
      if (explain && (!t || !t.explain || syn)) base.explain = explain;
      if (syn && Array.isArray(syn.cards) && syn.cards.length && !(t && (t.cards || []).length)) base.cards = syn.cards.filter(c => c && c.q && c.a).slice(0, 8);
      if (t) { await patch('topics', tid, base); }
      else {
        tid = slug((syn && syn.title) || title) + '-' + rid();
        const track = syn && cats().some(c => c.id === syn.track) ? syn.track : (B.cat !== 'all' ? B.cat : (C('categories').get('frontier') ? 'frontier' : (cats()[0] || {}).id));
        await put('topics', tid, Object.assign({ title: String((syn && syn.title) || title).slice(0, 120), cat: track, level: syn ? Math.max(0, Math.min(5, +syn.level || 2)) : 2, status: 'todo', source: 'me', priority: 2,
          parent: syn && valid.has(syn.parent) ? syn.parent : null, notes: '', cards: [], srs: null, log: [{ d: today(), a: 'researched' }], created: nowIso() }, base));
      }
      let subs = 0;
      for (const st of ((syn && syn.subtopics) || []).slice(0, 5)) { if (!st.title || findId(st.title)) continue; await put('topics', slug(st.title) + '-' + rid(), { title: String(st.title).slice(0, 120), cat: (C('topics').get(tid) || {}).cat, level: Math.max(0, Math.min(5, +st.level || 2)), status: 'suggested', source: 'ai', priority: 2, parent: tid, prereqs: [], related: [], why: String(st.summary || ''), explain: '', notes: '', cards: [], resources: [], srs: null, log: [{ d: today(), a: 'suggested' }], created: nowIso() }); subs++; }
      toast(`Researched “${title}”: ${res.length} sources${syn ? '' : ' (add an AI key in ⚡ App for explanations)'}${subs ? ` · ${subs} subtopics in Inbox` : ''}.`, 5000);
      setTimeout(() => open(tid, true), 400);
    } catch (e) { console.warn(e); toast('Research failed: ' + (e.message || e)); }
    finally { B.busy.delete(key); }
  }
  function dedupe(rs) { const s = new Set(); return rs.filter(r => r && r.url && !s.has(r.url) && s.add(r.url)).slice(0, 30); }
  async function genCards(t) {
    S.feat = 'Brain flashcards';
    try { const r = await S.sample.json(`Write 5 flashcards that test real understanding of "${t.title}". Context:\n${String(t.explain || t.why || '').slice(0, 3000)}\nReply JSON only: {"cards":[{"q":"...","a":"short answer"}]}`, { modelTier: 'quick' });
      const cs = ((r && r.cards) || []).filter(c => c && c.q && c.a); if (!cs.length) return toast('No cards came back.');
      await patch('topics', t.id, { cards: [...(t.cards || []), ...cs].slice(0, 20) }); toast(`${cs.length} cards added.`); setTimeout(drawDrawer, 150);
    } catch (e) { toast('Could not generate cards.'); }
  }

  /* ------------------------------------------------------------------ Today card */
  function today_() {
    const box = $('#tHV'); if (!box || S.tab !== 'today') return;
    const ts = topics(); const v = ts.filter(t => lane(t) === 'vertical'), h = ts.filter(t => lane(t) === 'horizontal'), r = ts.filter(t => lane(t) === 'review');
    const nxt = ts.filter(t => lane(t) === 'backlog' && ready(t)).length;
    const row = (t, tag) => `<li><span class="dot" style="--c:${colOf(t.cat)}"></span><div class="body"><div class="t"><a href="#" data-bo="${esc(t.id)}">${esc(t.title)}</a></div><div class="faint" style="font-size:12.5px">${tag} · ${esc(catName(t.cat))} · L${lvl(t)}</div></div></li>`;
    box.innerHTML = `<div class="sec-h"><h3>Horizontal × vertical</h3><button class="btn small ghost" id="tHVgo">Kanban</button></div>
      <ul class="items">${v.map(t => row(t, '⬇ Vertical')).join('')}${h.slice(0, 4).map(t => row(t, '↔ Horizontal')).join('')}${!v.length && !h.length ? '<li class="empty">Nothing in progress. Plan your next moves.</li>' : ''}</ul>
      <div class="row" style="justify-content:space-between;margin-top:8px"><span class="faint" style="font-size:12.5px">${nxt} ready in backlog · ${r.length} to review</span><button class="btn small" id="tHVplan">✦ Plan</button></div>`;
    $$('[data-bo]', box).forEach(a => a.onclick = e => { e.preventDefault(); open(a.dataset.bo); });
    $('#tHVgo').onclick = () => { B.view = 'kanban'; LS.set('brainView', 'kanban'); K.setTab('galaxy'); };
    $('#tHVplan').onclick = planMoves;
  }

  /* ------------------------------------------------------------------ renderer */
  K.renderers.push(function brain_() {
    seed();
    today_();
    if (S.tab !== 'galaxy') { if (B.G) B.G.pauseAnimation(); return; }
    shell();
    $$('[data-bv]').forEach(b => b.classList.toggle('on', b.dataset.bv === B.view));
    const ov = B.view === 'overview';
    ['smSubjects', 'smBrief', 'smViewsRow', 'smWrapRow', 'smFoot', 'smHead'].forEach(i => { const e = $('#' + i); if (e) e.hidden = !ov || (i === 'smBrief'); });
    if (ov && window.LGCore.SM) { window.LGCore.SM.view = 'map'; }
    $('#bzBrain').hidden = B.view !== 'brain'; $('#bzKanban').hidden = B.view !== 'kanban'; $('#bzCats').hidden = ov;
    $('#bzSugg') && ($('#bzSugg').checked = B.showSugg);
    drawCats();
    if (B.view === 'brain') { const G = ensureGraph(); if (G) { G.resumeAnimation(); sizeGraph(); updateGraph(); } }
    if (B.view === 'kanban') drawKanban();
    if (B.sel && !$('#bdrawer')?.hidden && !B.edit && !document.activeElement?.closest?.('#bdrawer')) drawDrawer();
  });
  render();
})();
