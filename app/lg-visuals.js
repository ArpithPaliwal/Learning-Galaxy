/* Learning Galaxy — signature visuals.
 *  - Galaxy (Skill Map tab): a realistic spiral galaxy. Each subject is an arm; your topics are named stars.
 *    Mastered topics sit near the bright core, learning ones mid-arm (pulsing), bucket further out, AI suggestions faint at the rim.
 *  - Radar (Radar tab): a sweeping radar. News items are blips; sector = kind (launch, repo, paper, article, practice),
 *    distance from the centre = age. Blips flash as the beam passes. "Target lock" = the newest item tied to what you study.
 * Both read the on-device store (LG.store) live and only animate while their tab is on screen. */
(function () {
  'use strict';
  const LG = window.LG; if (!LG) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
  const PAL = [[111, 198, 255], [196, 164, 255], [94, 230, 168], [255, 196, 107], [255, 138, 170], [140, 220, 255]];

  /* ---------- styles ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .lgv{position:relative;border-radius:24px;overflow:hidden;background:#01020a;margin-bottom:22px;box-shadow:0 30px 70px -40px rgb(0 0 0 / .8);isolation:isolate}
  .lgv canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
  .lgv-gx{height:min(72vh,680px);min-height:380px;cursor:grab}.lgv-gx.drag{cursor:grabbing}
  .lgv-rd{height:min(64vh,560px);min-height:380px}
  .lgv-hd{position:absolute;left:22px;top:18px;z-index:2;pointer-events:none;color:#eef3ff}
  .lgv-hd h3{margin:0;font:700 20px var(--f-hud,system-ui);letter-spacing:-.02em;color:#eef3ff}
  .lgv-hd p{margin:3px 0 0;font:500 12.5px var(--f-body,system-ui);color:#93a0cc;transition:opacity 1s}
  .lgv-tip{position:absolute;z-index:3;pointer-events:none;min-width:180px;max-width:250px;background:rgba(10,14,40,.86);border:1px solid rgba(150,180,255,.35);border-radius:14px;padding:9px 12px;font:500 12.5px var(--f-body,system-ui);color:#c9d3f5;backdrop-filter:blur(8px);transform:translate(14px,-50%);display:none}
  .lgv-tip small{font:600 10.5px var(--f-mono,monospace);letter-spacing:.04em}
  .lgv-tip b{display:block;font:700 14.5px var(--f-hud,system-ui);color:#fff;margin:2px 0}
  .lgv-lock{position:absolute;right:16px;top:16px;z-index:2;width:min(250px,calc(100% - 32px));background:rgba(4,18,40,.82);border:1px solid rgba(94,200,255,.4);border-radius:16px;padding:12px 14px;font:500 12.5px var(--f-body,system-ui);color:#b9c8e8;backdrop-filter:blur(6px);text-decoration:none;display:block}
  .lgv-lock small{font:600 10.5px var(--f-mono,monospace);color:#5EC8FF;letter-spacing:.04em}
  .lgv-lock b{display:block;font:700 15px var(--f-hud,system-ui);color:#fff;margin:4px 0}
  .lgv-lock:hover{border-color:#5EC8FF}
  .lgv-key{position:absolute;left:18px;bottom:14px;z-index:2;display:flex;gap:12px;flex-wrap:wrap;font:600 12px var(--f-body,system-ui);color:#a9b4d6;pointer-events:none}
  .lgv-key i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;box-shadow:0 0 8px currentColor;vertical-align:0}
  @media (max-width:640px){.lgv{border-radius:20px;margin-inline:-4px}.lgv-lock{top:auto;bottom:44px}.lgv-gx{height:62vh}}`;
  document.head.appendChild(css);

  /* ---------- live data from the store ---------- */
  const data = { topics: new Map(), categories: new Map(), news: new Map() };
  const subs = [];
  const watch = (col, q) => (q || LG.store.db.collection(col)).onSnapshot((s) => { data[col] = new Map(s.docs.map((d) => [d.id, Object.assign({ id: d.id }, d.data())])); subs.forEach((f) => f(col)); });

  const visible = (el) => el && el.isConnected && el.offsetParent !== null && !document.hidden;
  function canvasLoop(el, draw) {
    const cv = el.querySelector('canvas'), g = cv.getContext('2d'); let W = 0, H = 0, D = 1, last = performance.now();
    const fit = () => { const r = el.getBoundingClientRect(); D = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.max(1, W * D); cv.height = Math.max(1, H * D); g.setTransform(D, 0, 0, D, 0, 0); };
    new ResizeObserver(fit).observe(el); fit();
    (function f(now) { requestAnimationFrame(f); if (!visible(el) || !W) { last = now; return; } const dt = Math.min(0.05, (now - last) / 1000); last = now; draw(g, W, H, now, reduce ? 0 : dt); })(last);
    return cv;
  }

  /* =====================================================================
   * GALAXY
   * ===================================================================== */
  function mountGalaxy() {
    const view = document.getElementById('v-galaxy'); if (!view || view.querySelector('.lgv-gx')) return;
    const el = document.createElement('div'); el.className = 'lgv lgv-gx space';
    el.innerHTML = '<canvas aria-label="Your learning galaxy: drag to turn, scroll to zoom, tap a star to open the topic"></canvas><div class="lgv-hd"><h3>Your galaxy</h3><p id="gxHint"></p></div><div class="lgv-tip"></div><div class="lgv-key" id="gxKey"></div>';
    view.insertBefore(el, view.firstChild);
    const tip = el.querySelector('.lgv-tip');

    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
    const ARMS = 2, PITCH = 0.42; const armAngle = (r) => Math.log(r / 0.07) / Math.tan(PITCH);
    const big = innerWidth * innerHeight > 900000;
    const N = big ? 26000 : 11000, BULGE = big ? 6000 : 2800, GAS = big ? 1400 : 700, DUSTN = big ? 2400 : 1100;
    const stars = [];
    for (let i = 0; i < N; i++) { const r = Math.min(1, 0.05 + -Math.log(1 - rnd() * 0.97) * 0.27); const arm = Math.floor(rnd() * ARMS); const sp = (0.22 + 0.55 * (1 - r)) * (rnd() < 0.55 ? 0.42 : 1.6);
      let col = mix([255, 228, 190], [170, 205, 255], Math.min(1, r / 0.85)); if (rnd() < 0.15) col = mix(col, [255, 255, 255], 0.6);
      stars.push([r, armAngle(r) + arm * Math.PI + gauss() * sp, gauss() * 0.02 * (1.3 - r), rnd() < 0.05 ? 1.7 : 1, `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`, 0.3 + rnd() * 0.55, 0]); }
    for (let i = 0; i < BULGE; i++) stars.push([Math.abs(gauss()) * 0.14, rnd() * 6.283, gauss() * 0.05, 1, `rgb(255,${(215 + rnd() * 30) | 0},${(170 + rnd() * 40) | 0})`, 0.18 + rnd() * 0.3, 0]);
    for (let i = 0; i < GAS; i++) { const r = 0.08 + rnd() * 0.92, arm = Math.floor(rnd() * ARMS); stars.push([r, armAngle(r) + arm * Math.PI + gauss() * (0.25 + 0.3 * (1 - r)), 0, 1, '', 0.04 + rnd() * 0.05, 2]); }
    const dust = []; for (let i = 0; i < DUSTN; i++) { const r = 0.12 + rnd() * 0.8, arm = Math.floor(rnd() * ARMS); dust.push([r, armAngle(r) + arm * Math.PI - 0.22 + gauss() * 0.06, gauss() * 0.01, 2.2 + rnd() * 2.5, 0.08 + rnd() * 0.08]); }
    const sky = Array.from({ length: big ? 700 : 300 }, () => [rnd(), rnd(), rnd() * 1.1 + 0.2, rnd() * 0.6 + 0.15, rnd() * 6.28]);
    const sprite = (rgb, size, core = 1) => { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gr.addColorStop(0, `rgba(255,255,255,${core})`); gr.addColorStop(0.15, `rgba(${rgb},0.9)`); gr.addColorStop(0.45, `rgba(${rgb},0.25)`); gr.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = gr; x.fillRect(0, 0, size, size); return c; };
    const GASS = sprite('120,160,255', 64, 0.6);
    const DUSTS = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(4,2,10,1)'); gr.addColorStop(1, 'rgba(4,2,10,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return c; })();
    const spriteCache = new Map(); const spr = (rgb) => { const k = rgb.join(','); if (!spriteCache.has(k)) spriteCache.set(k, sprite(k, 64)); return spriteCache.get(k); };

    // topics → named stars
    let topics = [], cats = [];
    const ZONE = { learned: [0.14, 0.34], learning: [0.34, 0.58], todo: [0.56, 0.86], suggested: [0.8, 0.98] };
    function rebuild() {
      cats = [...data.categories.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      const ci = new Map(cats.map((c, i) => [c.id, i]));
      topics = [...data.topics.values()].filter((t) => !t.hidden).map((t) => {
        const st = ZONE[t.status] ? t.status : 'todo'; const i = ci.has(t.cat) ? ci.get(t.cat) : 0; const h = hash(t.id), h2 = hash(t.id + '*');
        const [a, b] = ZONE[st]; const r = a + (b - a) * h;
        const arm = i % ARMS; const side = (Math.floor(i / ARMS) % 2 ? 0.32 : -0.06) + (h2 - 0.5) * 0.22;
        return { id: t.id, name: t.title || 'Untitled', st, cat: (cats[i] && cats[i].name) || 'Other', col: PAL[i % PAL.length], r, th: armAngle(r) + arm * Math.PI + side };
      });
      const n = (s) => topics.filter((t) => t.st === s).length;
      el.querySelector('#gxHint').textContent = `${topics.length} topics · ${n('learned')} mastered · ${n('learning')} learning now · drag to turn, tap a star`;
      el.querySelector('#gxKey').innerHTML = cats.slice(0, 6).map((c, i) => `<span style="color:rgb(${PAL[i % PAL.length].join(',')})"><i style="background:rgb(${PAL[i % PAL.length].join(',')})"></i>${esc(c.name)}</span>`).join('');
    }
    subs.push((c) => (c === 'topics' || c === 'categories') && rebuild());

    // camera + input
    let yaw = 0.4, tilt = 0.95, zoom = 1, spin = 0, drag = null, mouse = { x: -1, y: -1 }, hover = null, moved = 0;
    const cv = canvasLoop(el, draw);
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw, tilt }; moved = 0; el.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; if (!drag) return; moved += Math.abs(e.movementX) + Math.abs(e.movementY); yaw = drag.yaw + (e.clientX - drag.x) * 0.005; tilt = Math.max(0.2, Math.min(1.4, drag.tilt + (e.clientY - drag.y) * 0.004)); });
    cv.addEventListener('pointerup', () => { const wasDrag = moved > 6; drag = null; el.classList.remove('drag'); if (!wasDrag && hover && window.LGApp && window.LGApp.openTopic) window.LGApp.openTopic(hover.id); });
    cv.addEventListener('pointerleave', () => { mouse = { x: -1, y: -1 }; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.6, Math.min(2.6, zoom * Math.exp(-e.deltaY * 0.0012))); }, { passive: false });

    function project(r, th, z, rot, scale, cx, cy) {
      const a = th + rot; let x = Math.cos(a) * r, y = Math.sin(a) * r; const cY = Math.cos(yaw), sY = Math.sin(yaw); [x, y] = [x * cY - y * sY, x * sY + y * cY];
      const cT = Math.cos(tilt), sT = Math.sin(tilt); const y2 = y * cT - z * sT, z2 = y * sT + z * cT; const p = 2.6 / (2.6 + z2); return [cx + x * scale * p, cy + y2 * scale * p, p];
    }
    function draw(g, W, H, now, dt) {
      spin += dt; const cx = W / 2, cy = H / 2 + 14, scale = Math.min(W * 0.62, H * 0.95) * 0.62 * zoom; const rotOf = (r) => spin * 0.05 / Math.max(0.12, r);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#01020a'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#dfe8ff'; for (const [x, y, s, a, ph] of sky) { g.globalAlpha = a * (0.65 + 0.35 * Math.sin(now / 900 + ph * 3)); g.fillRect(x * W, y * H, s, s); }
      g.globalCompositeOperation = 'lighter';
      const [ccx, ccy] = project(0, 0, 0, 0, scale, cx, cy); const cg = g.createRadialGradient(ccx, ccy, 0, ccx, ccy, scale * 0.42);
      cg.addColorStop(0, 'rgba(255,236,212,.6)'); cg.addColorStop(0.1, 'rgba(255,200,140,.28)'); cg.addColorStop(0.4, 'rgba(120,120,255,.12)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(ccx, ccy); g.scale(1, Math.max(0.25, Math.cos(tilt) * 0.9 + 0.1)); g.translate(-ccx, -ccy); g.globalAlpha = 1; g.fillStyle = cg; g.beginPath(); g.arc(ccx, ccy, scale * 0.42, 0, 7); g.fill(); g.restore();
      const zs = Math.min(1.6, zoom);
      for (const s of stars) {
        const [x, y, p] = project(s[0], s[1], s[2], rotOf(s[0]), scale, cx, cy); if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        g.globalAlpha = s[5];
        if (s[6] === 2) { const sz = 52 * p * zoom; g.globalAlpha = s[5] * 0.8; g.drawImage(GASS, x - sz / 2, y - sz / 2, sz, sz); continue; }
        g.fillStyle = s[4]; const sz = s[3] * p * zs; g.fillRect(x, y, sz, sz);
      }
      g.globalCompositeOperation = 'source-over';
      for (const d of dust) { const [x, y, p] = project(d[0], d[1], d[2], rotOf(d[0]), scale, cx, cy); g.globalAlpha = d[4] * 1.6; const sz = d[3] * 3 * p * zoom; g.drawImage(DUSTS, x - sz / 2, y - sz / 2, sz, sz); }
      // topics
      g.globalCompositeOperation = 'lighter'; hover = null; let best = 16;
      for (const t of topics) {
        const [x, y, p] = project(t.r, t.th, 0.01, rotOf(t.r), scale, cx, cy); t.sx = x; t.sy = y;
        const base = t.st === 'learned' ? 30 : t.st === 'learning' ? 26 : t.st === 'todo' ? 17 : 11;
        const pulse = t.st === 'learning' ? 1 + 0.25 * Math.sin(now / 350 + t.r * 20) : 1;
        const sz = base * p * pulse * Math.min(1.5, Math.sqrt(zoom)); const d = Math.hypot(mouse.x - x, mouse.y - y);
        g.globalAlpha = t.st === 'suggested' ? 0.4 : t.st === 'todo' ? 0.8 : 1; if (d < 22) g.globalAlpha = 1;
        g.drawImage(spr(t.col), x - sz / 2, y - sz / 2, sz, sz); if (d < best) { best = d; hover = t; }
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      const cur = topics.find((t) => t.st === 'learning');
      if (cur && cur.sx != null) { const k = (now / 1600) % 1; g.strokeStyle = `rgba(${cur.col.join(',')},${0.6 * (1 - k)})`; g.lineWidth = 1.2; g.beginPath(); g.arc(cur.sx, cur.sy, 8 + k * 18, 0, 7); g.stroke(); }
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
      if (hover) {
        g.strokeStyle = `rgba(${hover.col.join(',')},.9)`; g.lineWidth = 1.5; g.beginPath(); g.arc(hover.sx, hover.sy, 13, 0, 7); g.stroke(); cv.style.cursor = 'pointer';
        const label = { learned: 'Mastered', learning: 'Learning now', todo: 'In your bucket', suggested: 'Suggested' }[hover.st];
        tip.style.display = 'block'; tip.style.left = Math.min(hover.sx, W - 270) + 'px'; tip.style.top = hover.sy + 'px';
        tip.innerHTML = `<small style="color:rgb(${hover.col.join(',')})">${esc(hover.cat)} · ${label}</small><b>${esc(hover.name)}</b>Tap to open`;
      } else { tip.style.display = 'none'; cv.style.cursor = ''; }
    }
    rebuild();
  }

  /* =====================================================================
   * RADAR
   * ===================================================================== */
  const KINDS = [['launch', 'Launches', [94, 200, 255]], ['repo', 'Repos', [61, 220, 151]], ['paper', 'Papers', [255, 181, 71]], ['article', 'Articles', [182, 156, 255]], ['practice', 'Practice', [255, 138, 170]]];
  function mountRadar() {
    const view = document.getElementById('v-radar'); if (!view || view.querySelector('.lgv-rd')) return;
    const head = view.querySelector('.sm-head');
    const el = document.createElement('div'); el.className = 'lgv lgv-rd space';
    el.innerHTML = '<canvas aria-label="News radar: newer items sit closer to the centre"></canvas><div class="lgv-hd"><h3>Radar</h3><p id="rdHint"></p></div><a class="lgv-lock" id="rdLock" target="_blank" rel="noopener" hidden></a><div class="lgv-tip"></div>'
      + `<div class="lgv-key">${KINDS.map(([, n, c]) => `<span style="color:rgb(${c.join(',')})"><i style="background:rgb(${c.join(',')})"></i>${n}</span>`).join('')}</div>`;
    head ? head.after(el) : view.insertBefore(el, view.firstChild);
    const tip = el.querySelector('.lgv-tip'), lock = el.querySelector('#rdLock');
    let blips = [], beam = 0, mouse = { x: -1, y: -1 }, hover = null;
    const day = (s) => { const d = new Date(String(s || '').slice(0, 10) + 'T00:00:00'); return isNaN(d) ? null : d; };
    function rebuild() {
      const items = [...data.news.values()].filter((n) => n.title && day(n.date || n.added)).sort((a, b) => String(b.date || b.added).localeCompare(String(a.date || a.added))).slice(0, 48);
      if (!items.length) { blips = []; el.querySelector('#rdHint').textContent = 'No signals yet. The daily job fills the radar every morning.'; lock.hidden = true; return; }
      const newest = day(items[0].date || items[0].added).getTime(); const span = Math.max(3, (newest - day(items[items.length - 1].date || items[items.length - 1].added).getTime()) / 864e5);
      blips = items.map((n) => {
        const k = KINDS.findIndex(([id]) => id === n.kind); const ki = k < 0 ? 3 : k; const age = (newest - day(n.date || n.added).getTime()) / 864e5;
        const sector = (ki / KINDS.length) * 6.283; const ang = sector + (0.12 + hash(n.id || n.title) * 0.76) * (6.283 / KINDS.length);
        return { n, col: KINDS[ki][2], kind: KINDS[ki][1], ang, rad: 0.12 + 0.82 * Math.min(1, age / span), lit: 0 };
      });
      const learning = [...data.topics.values()].filter((t) => t.status === 'learning' || t.status === 'todo').map((t) => String(t.title || '').toLowerCase());
      const pick = items.find((n) => n.topic && learning.some((l) => l && (l.includes(String(n.topic).toLowerCase().slice(0, 14)) || String(n.topic).toLowerCase().includes(l.slice(0, 14))))) || items.find((n) => n.kind === 'launch') || items[0];
      lock.hidden = false; lock.href = /^https?:/.test(pick.url || '') ? pick.url : '#';
      lock.innerHTML = `<small>TARGET LOCK${pick.topic ? ' · fits your study' : ''}</small><b>${esc(pick.title)}</b>${esc(String(pick.summary || '').slice(0, 140))}${String(pick.summary || '').length > 140 ? '…' : ''}`;
      el.querySelector('#rdHint').textContent = `${items.length} signals · newest at the centre · tap a blip to open it`;
    }
    subs.push((c) => (c === 'news' || c === 'topics') && rebuild());
    const cv = canvasLoop(el, draw);
    cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    cv.addEventListener('pointerleave', () => { mouse = { x: -1, y: -1 }; });
    cv.addEventListener('click', () => { if (hover && /^https?:/.test(hover.n.url || '')) window.open(hover.n.url, '_blank', 'noopener'); });
    function draw(g, W, H, now, dt) {
      const cx = W / 2, cy = H / 2 + 16, R = Math.min(W, H) * 0.42; beam = (beam + dt * 1.25) % 6.283;
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7); bg.addColorStop(0, '#0b2a4a'); bg.addColorStop(0.45, '#041326'); bg.addColorStop(1, '#01040c'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // rings, cross, ticks
      g.strokeStyle = 'rgba(94,200,255,.22)'; g.lineWidth = 1; for (let i = 1; i <= 4; i++) { g.beginPath(); g.arc(cx, cy, R * i / 4, 0, 7); g.stroke(); }
      g.strokeStyle = 'rgba(94,200,255,.5)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(94,200,255,.14)'; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
      for (let i = 0; i < 72; i++) { const a = i / 72 * 6.283, L = i % 6 ? 4 : 9; g.strokeStyle = 'rgba(94,200,255,.45)'; g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R + L), cy + Math.sin(a) * (R + L)); g.stroke(); }
      // sector dividers
      g.strokeStyle = 'rgba(94,200,255,.08)'; for (let k = 0; k < KINDS.length; k++) { const a = k / KINDS.length * 6.283 - Math.PI / 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
      // sweep (trail behind the beam)
      g.save(); g.translate(cx, cy); g.rotate(beam - Math.PI / 2);
      const sw = g.createConicGradient ? g.createConicGradient(0, 0, 0) : null;
      if (sw) { sw.addColorStop(0, 'rgba(94,200,255,0)'); sw.addColorStop(0.75, 'rgba(94,200,255,0)'); sw.addColorStop(0.95, 'rgba(94,200,255,.18)'); sw.addColorStop(1, 'rgba(140,225,255,.55)'); g.fillStyle = sw; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(190,240,255,.9)'; g.lineWidth = 2; g.shadowColor = '#5EC8FF'; g.shadowBlur = 12; g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0); g.stroke(); g.restore();
      // blips: light up when the beam passes, then fade
      hover = null; let best = 14;
      for (const b of blips) {
        const a = b.ang - Math.PI / 2; const x = cx + Math.cos(a) * b.rad * R, y = cy + Math.sin(a) * b.rad * R; b.x = x; b.y = y;
        let diff = (beam - b.ang) % 6.283; if (diff < 0) diff += 6.283; if (diff < 0.08) b.lit = 1; b.lit = Math.max(0, b.lit - dt * 0.28);
        const d = Math.hypot(mouse.x - x, mouse.y - y); if (d < best) { best = d; hover = b; }
        const a2 = 0.3 + 0.7 * b.lit; g.globalAlpha = a2; g.fillStyle = `rgb(${b.col.join(',')})`; g.shadowColor = `rgb(${b.col.join(',')})`; g.shadowBlur = 6 + 18 * b.lit;
        g.beginPath(); g.arc(x, y, 3.2 + 2.2 * b.lit, 0, 7); g.fill(); g.shadowBlur = 0;
      }
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.shadowColor = '#5EC8FF'; g.shadowBlur = 18; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill(); g.shadowBlur = 0;
      if (hover) {
        g.strokeStyle = `rgb(${hover.col.join(',')})`; g.lineWidth = 1.4; g.beginPath(); g.arc(hover.x, hover.y, 10, 0, 7); g.stroke(); cv.style.cursor = 'pointer';
        tip.style.display = 'block'; tip.style.left = Math.min(hover.x, W - 265) + 'px'; tip.style.top = hover.y + 'px';
        tip.innerHTML = `<small style="color:rgb(${hover.col.join(',')})">${esc(hover.kind)} · ${esc(hover.n.source || '')}</small><b>${esc(hover.n.title)}</b>${esc(String(hover.n.date || hover.n.added || '').slice(0, 10))}`;
      } else { tip.style.display = 'none'; cv.style.cursor = ''; }
    }
    rebuild();
  }

  LG.store.ready.then(() => {
    watch('categories'); watch('topics'); watch('news', LG.store.db.collection('news').orderBy('date', 'desc').limit(80));
    const go = () => { mountGalaxy(); mountRadar(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  });
})();
