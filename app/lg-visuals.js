/* Learning Galaxy — signature visuals.
 *  - Skill chart (Skill Map tab): a radar-style star chart; sectors = subjects, rings = stage (mastered at the centre).
 *  - Jarvis sonar core (Jarvis panel): rotating rings that react to listening / thinking / speaking.
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
   * SKILL CHART (Skill Map tab): your topics on a radar-style star chart
   * sectors = subjects, rings = stage (mastered at the centre → suggestions at the rim)
   * ===================================================================== */
  const BANDS = [['learned', 'Mastered', 0.1, 0.3], ['learning', 'Learning', 0.3, 0.5], ['todo', 'Bucket', 0.5, 0.76], ['suggested', 'Suggested', 0.76, 0.96]];
  function mountGalaxy() {
    const view = document.getElementById('v-galaxy'); if (!view || view.querySelector('.lgv-gx')) return;
    const el = document.createElement('div'); el.className = 'lgv lgv-gx space';
    el.innerHTML = '<canvas aria-label="Skill chart: your topics by subject and stage. Tap a dot to open the topic."></canvas><div class="lgv-hd"><h3>Skill chart</h3><p id="gxHint"></p></div><a class="lgv-lock" id="gxLock" hidden></a><div class="lgv-tip"></div><div class="lgv-key" id="gxKey"></div>';
    view.insertBefore(el, view.firstChild);
    const tip = el.querySelector('.lgv-tip'), lock = el.querySelector('#gxLock');
    let dots = [], cats = [], beam = 0, mouse = { x: -1, y: -1 }, hover = null;
    function rebuild() {
      cats = [...data.categories.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)); if (!cats.length) cats = [{ id: 'all', name: 'Topics' }];
      const ci = new Map(cats.map((c, i) => [c.id, i])); const n = cats.length;
      dots = [...data.topics.values()].filter((t) => !t.hidden).map((t) => {
        const band = BANDS.find((b) => b[0] === t.status) || BANDS[2]; const i = ci.has(t.cat) ? ci.get(t.cat) : 0;
        const h = hash(t.id), h2 = hash(t.id + '#');
        return { id: t.id, name: t.title || 'Untitled', st: band[0], stage: band[1], cat: cats[i].name, col: PAL[i % PAL.length],
          ang: (i + 0.08 + h * 0.84) / n * 6.283, rad: band[2] + (band[3] - band[2]) * (0.12 + h2 * 0.76), lit: 0 };
      });
      const c = (s) => dots.filter((d) => d.st === s).length;
      el.querySelector('#gxHint').textContent = `${dots.length} topics · ${c('learned')} mastered · ${c('learning')} learning · tap a dot to open it`;
      el.querySelector('#gxKey').innerHTML = cats.slice(0, 6).map((k, i) => `<span style="color:rgb(${PAL[i % PAL.length].join(',')})"><i style="background:rgb(${PAL[i % PAL.length].join(',')})"></i>${esc(k.name)}</span>`).join('');
      const cur = dots.find((d) => d.st === 'learning');
      if (cur) { lock.hidden = false; lock.href = '#'; lock.innerHTML = `<small>LEARNING NOW · ${esc(cur.cat)}</small><b>${esc(cur.name)}</b>Tap to open`; lock.onclick = (e) => { e.preventDefault(); window.LGApp && window.LGApp.openTopic(cur.id); }; } else lock.hidden = true;
    }
    subs.push((c) => (c === 'topics' || c === 'categories') && rebuild());
    const cv = canvasLoop(el, draw);
    cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    cv.addEventListener('pointerleave', () => { mouse = { x: -1, y: -1 }; });
    cv.addEventListener('click', () => { if (hover && window.LGApp) window.LGApp.openTopic(hover.id); });
    function draw(g, W, H, now, dt) {
      const cx = W / 2, cy = H / 2 + 14, R = Math.min(W, H) * 0.42; beam = (beam + dt * 0.7) % 6.283;
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7); bg.addColorStop(0, '#0b2a4a'); bg.addColorStop(0.45, '#041326'); bg.addColorStop(1, '#01040c'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // stage rings + labels
      g.font = '500 10px "JetBrains Mono", monospace';
      for (const [, label, , outer] of BANDS) { g.strokeStyle = 'rgba(94,200,255,.2)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, outer * R, 0, 7); g.stroke(); g.fillStyle = 'rgba(143,200,240,.55)'; g.fillText(label.toUpperCase(), cx + 6, cy - outer * R + 12); }
      g.strokeStyle = 'rgba(94,200,255,.5)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
      for (let i = 0; i < 120; i++) { const a = i / 120 * 6.283, L = i % 10 ? 3 : 8; g.strokeStyle = 'rgba(94,200,255,.4)'; g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R + L), cy + Math.sin(a) * (R + L)); g.stroke(); }
      // subject sectors + names at the rim
      const n = cats.length;
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.283 - Math.PI / 2; g.strokeStyle = 'rgba(94,200,255,.12)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
        const m = (i + 0.5) / n * 6.283 - Math.PI / 2; const lx = cx + Math.cos(m) * (R + 22), ly = cy + Math.sin(m) * (R + 22);
        g.fillStyle = `rgba(${PAL[i % PAL.length].join(',')},.9)`; g.font = '600 12px Manrope, system-ui'; g.textAlign = Math.cos(m) > 0.2 ? 'left' : Math.cos(m) < -0.2 ? 'right' : 'center'; g.fillText(cats[i].name, lx, ly + 4); g.textAlign = 'left';
      }
      // sweep
      g.save(); g.translate(cx, cy); g.rotate(beam - Math.PI / 2);
      if (g.createConicGradient) { const sw = g.createConicGradient(0, 0, 0); sw.addColorStop(0, 'rgba(94,200,255,0)'); sw.addColorStop(0.8, 'rgba(94,200,255,0)'); sw.addColorStop(0.97, 'rgba(94,200,255,.14)'); sw.addColorStop(1, 'rgba(140,225,255,.4)'); g.fillStyle = sw; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(190,240,255,.8)'; g.lineWidth = 1.5; g.shadowColor = '#5EC8FF'; g.shadowBlur = 10; g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0); g.stroke(); g.restore();
      // topic dots
      hover = null; let best = 12;
      for (const d of dots) {
        const a = d.ang - Math.PI / 2; const x = cx + Math.cos(a) * d.rad * R, y = cy + Math.sin(a) * d.rad * R; d.x = x; d.y = y;
        let diff = (beam - d.ang) % 6.283; if (diff < 0) diff += 6.283; if (diff < 0.06) d.lit = 1; d.lit = Math.max(0, d.lit - dt * 0.35);
        const base = d.st === 'learned' ? 4.6 : d.st === 'learning' ? 4.8 : d.st === 'todo' ? 3.2 : 2.4;
        const alpha = d.st === 'suggested' ? 0.35 : d.st === 'todo' ? 0.65 : 1;
        const dd = Math.hypot(mouse.x - x, mouse.y - y); if (dd < best) { best = dd; hover = d; }
        g.globalAlpha = Math.min(1, alpha + d.lit * 0.6); g.fillStyle = `rgb(${d.col.join(',')})`; g.shadowColor = g.fillStyle; g.shadowBlur = (d.st === 'learned' ? 10 : 4) + 14 * d.lit;
        g.beginPath(); g.arc(x, y, base + 1.5 * d.lit, 0, 7); g.fill(); g.shadowBlur = 0;
        if (d.st === 'learning') { const k = (now / 1500 + d.rad) % 1; g.globalAlpha = 0.7 * (1 - k); g.strokeStyle = g.fillStyle; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 6 + k * 14, 0, 7); g.stroke(); }
      }
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.shadowColor = '#5EC8FF'; g.shadowBlur = 16; g.beginPath(); g.arc(cx, cy, 3.5, 0, 7); g.fill(); g.shadowBlur = 0;
      if (hover) {
        g.strokeStyle = `rgb(${hover.col.join(',')})`; g.lineWidth = 1.4; g.beginPath(); g.arc(hover.x, hover.y, 10, 0, 7); g.stroke(); cv.style.cursor = 'pointer';
        tip.style.display = 'block'; tip.style.left = Math.min(hover.x, W - 265) + 'px'; tip.style.top = hover.y + 'px';
        tip.innerHTML = `<small style="color:rgb(${hover.col.join(',')})">${esc(hover.cat)} · ${hover.stage}</small><b>${esc(hover.name)}</b>Tap to open`;
      } else { tip.style.display = 'none'; cv.style.cursor = ''; }
    }
    rebuild();
  }

  /* =====================================================================
   * JARVIS SONAR CORE: rotating rings and ticks; reacts to listening / thinking / speaking
   * ===================================================================== */
  function mountJarvisCore() {
    const log = document.getElementById('jLog'); if (!log || document.querySelector('.j-core')) return;
    const el = document.createElement('div'); el.className = 'j-core'; el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="st" id="jcSt">Online</div>';
    log.parentNode.insertBefore(el, log);
    const st = el.querySelector('#jcSt'); let energy = 0.2, t = 0, mode = 'idle';
    const rings = [[0.34, 0.5, 0, 40], [0.5, -0.3, 6, 0], [0.66, 0.18, 0, 90], [0.82, -0.12, 14, 0], [0.98, 0.06, 0, 160]];
    canvasLoop(el, (g, W, H, now, dt) => {
      t += dt; const orb = document.getElementById('orb'); const sub = (document.getElementById('jSub') || {}).textContent || '';
      mode = /Speaking/i.test(sub) ? 'speaking' : /Listening/i.test(sub) ? 'listening' : (orb && orb.classList.contains('busy')) || /Thinking/i.test(sub) ? 'thinking' : 'idle';
      st.textContent = { idle: 'Online', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' }[mode];
      energy += ({ idle: 0.2, listening: 0.55, thinking: 0.9, speaking: 0.65 }[mode] - energy) * Math.min(1, dt * 3);
      const voice = mode === 'speaking' ? Math.abs(Math.sin(t * 9) * Math.sin(t * 3.1)) : mode === 'listening' ? Math.abs(Math.sin(t * 5) * Math.sin(t * 1.7)) : 0;
      const cx = W / 2, cy = H / 2 - 6, R = Math.min(W, H) * 0.4; const sp = 0.5 + energy * 2.2;
      g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2); cg.addColorStop(0, `rgba(94,200,255,${0.12 + energy * 0.12 + voice * 0.15})`); cg.addColorStop(1, 'rgba(94,200,255,0)'); g.fillStyle = cg; g.fillRect(0, 0, W, H);
      // rings: solid, dashed, or tick rings, each turning at its own speed
      rings.forEach(([rr, speed, dash, ticks], i) => {
        const rad = rr * R * (1 + (i === 2 ? voice * 0.08 : 0)); const rot = t * speed * sp;
        g.save(); g.translate(cx, cy); g.rotate(rot); g.strokeStyle = `rgba(94,200,255,${0.25 + 0.25 * energy})`; g.lineWidth = i === 4 ? 1.2 : 1;
        if (ticks) { for (let k = 0; k < ticks; k++) { const a = k / ticks * 6.283, L = k % 10 ? 3 : 7; g.beginPath(); g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); g.lineTo(Math.cos(a) * (rad - L), Math.sin(a) * (rad - L)); g.stroke(); } }
        else { g.setLineDash([dash, dash]); g.beginPath(); g.arc(0, 0, rad, 0, 7); g.stroke(); g.setLineDash([]); }
        // a bright arc segment on each ring
        g.strokeStyle = `rgba(160,230,255,${0.5 + 0.4 * energy})`; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, rad, 0, 0.5 + i * 0.15); g.stroke();
        g.restore();
      });
      // voice ring: a waveform around the core
      g.strokeStyle = `rgba(190,240,255,${0.5 + voice * 0.5})`; g.lineWidth = 1.5; g.beginPath();
      for (let k = 0; k <= 96; k++) { const a = k / 96 * 6.283; const w = 1 + (voice * 0.22 + 0.02) * Math.sin(a * 8 + t * 10) * Math.sin(a * 3 - t * 4); const x = cx + Math.cos(a) * R * 0.22 * w, y = cy + Math.sin(a) * R * 0.22 * w; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      // sweep
      g.save(); g.translate(cx, cy); g.rotate(t * sp * 1.4);
      if (g.createConicGradient) { const sw = g.createConicGradient(0, 0, 0); sw.addColorStop(0, 'rgba(94,200,255,0)'); sw.addColorStop(0.82, 'rgba(94,200,255,0)'); sw.addColorStop(1, `rgba(140,225,255,${0.25 + energy * 0.25})`); g.fillStyle = sw; g.beginPath(); g.arc(0, 0, R * 0.98, 0, 7); g.fill(); }
      g.restore();
      // thinking: scanning arc
      if (mode === 'thinking') { const a = t * 4; g.strokeStyle = 'rgba(200,245,255,.9)'; g.lineWidth = 2.5; g.shadowColor = '#5EC8FF'; g.shadowBlur = 12; g.beginPath(); g.arc(cx, cy, R * 0.66, a, a + 0.9); g.stroke(); g.shadowBlur = 0; }
      // core
      g.fillStyle = '#e6f8ff'; g.shadowColor = '#5EC8FF'; g.shadowBlur = 18 + voice * 20; g.beginPath(); g.arc(cx, cy, 3.5 + voice * 3, 0, 7); g.fill(); g.shadowBlur = 0;
    });
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
    const safe = (fn) => { try { fn(); } catch (e) { console.warn('lg-visuals', e); } };
    const go = () => { safe(mountJarvisCore); safe(mountGalaxy); safe(mountRadar); };
    setInterval(() => { if (!document.querySelector('.j-core')) safe(mountJarvisCore); }, 2000);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  });
})();
