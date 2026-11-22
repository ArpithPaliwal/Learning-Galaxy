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
  const PALL = [[0, 110, 210], [118, 74, 230], [0, 150, 105], [205, 120, 0], [205, 50, 105], [0, 130, 175]];
  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
  const pal = (i) => (isLight() ? PALL : PAL)[i % PAL.length];
  // canvas colour kit for the current theme
  const kit = () => isLight()
    ? { light: true, c: (a) => 'rgba(30,105,200,' + Math.min(1, a * 1.5) + ')', b: (a) => 'rgba(20,80,180,' + Math.min(1, a * 1.1) + ')', bg0: '#ffffff', bg1: '#edf3fc', bg2: '#d6e3f6', glow: 'rgba(35,100,220,.5)', hi: '#ffffff', mid: '#2a7fd6', plate: 'rgba(255,255,255,.9)', rim: 'rgba(30,80,170,.9)' }
    : { light: false, c: (a) => 'rgba(94,200,255,' + a + ')', b: (a) => 'rgba(170,230,255,' + a + ')', bg0: '#0b2a4a', bg1: '#041326', bg2: '#01040c', glow: '#5EC8FF', hi: '#e6f8ff', mid: '#8fdcff', plate: 'rgba(2,12,28,.72)', rim: 'rgba(10,40,90,.9)' };

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
  html[data-theme="light"] .lgv{background:#edf3fc;border:1px solid #c8d4ee;box-shadow:0 20px 50px -30px rgb(30 80 170 / .35)}
  html[data-theme="light"] .lgv-hd h3{color:#0d1530} html[data-theme="light"] .lgv-hd p{color:#45517a}
  html[data-theme="light"] .lgv-tip,html[data-theme="light"] .lgv-lock{background:rgba(255,255,255,.94);border-color:#c8d4ee;color:#45517a;box-shadow:0 10px 30px -14px rgb(13 21 48 / .3)}
  html[data-theme="light"] .lgv-tip b,html[data-theme="light"] .lgv-lock b{color:#0d1530} html[data-theme="light"] .lgv-lock small{color:#1f6fd6}
  html[data-theme="light"] .lgv-key{color:#45517a}
  .lgv-gx .lgv-lock{top:auto;bottom:44px;width:min(230px,calc(100% - 32px))}
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
   * SKILL HOLO-TABLE (Skill Map tab): a tilted 3D sonar disc; each topic is a glowing pin.
   * sectors = subjects, distance from centre = stage, pin height = how far along you are.
   * Drag to turn it, tap a pin to open the topic.
   * ===================================================================== */
  const BANDS = [['learned', 'Mastered', 0.12, 0.32, 1], ['learning', 'Learning', 0.32, 0.52, 0.7], ['todo', 'Bucket', 0.52, 0.76, 0.32], ['suggested', 'Suggested', 0.76, 0.96, 0.06]];
  function mountGalaxy() {
    const view = document.getElementById('v-galaxy'); if (!view || view.querySelector('.lgv-gx')) return;
    const el = document.createElement('div'); el.className = 'lgv lgv-gx space';
    el.innerHTML = '<canvas aria-label="Skill holo-table: your topics as pins by subject and stage. Drag to turn, tap a pin to open it."></canvas><div class="lgv-hd"><h3>Skill map</h3><p id="gxHint"></p></div><a class="lgv-lock" id="gxLock" hidden></a><div class="lgv-tip"></div><div class="lgv-key" id="gxKey"></div>';
    view.insertBefore(el, view.firstChild);
    const tip = el.querySelector('.lgv-tip'), lock = el.querySelector('#gxLock');
    let dust = null, pins = [], cats = [], beam = 0, yaw = -0.5, tilt = 1.02, drag = null, moved = 0, mouse = { x: -1, y: -1 }, hover = null, auto = 1;
    function rebuild() {
      cats = [...data.categories.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)); if (!cats.length) cats = [{ id: 'all', name: 'Topics' }];
      const ci = new Map(cats.map((c, i) => [c.id, i])); const n = cats.length;
      pins = [...data.topics.values()].filter((t) => !t.hidden).map((t) => {
        const band = BANDS.find((b) => b[0] === t.status) || BANDS[2]; const i = ci.has(t.cat) ? ci.get(t.cat) : 0; const h = hash(t.id), h2 = hash(t.id + '#');
        return { id: t.id, name: t.title || 'Untitled', st: band[0], stage: band[1], cat: cats[i].name, get col() { return pal(i); },
          ang: (i + 0.08 + h * 0.84) / n * 6.283, rad: band[2] + (band[3] - band[2]) * (0.12 + h2 * 0.76), ht: band[4] * (0.75 + 0.25 * hash(t.id + '^')), lit: 0 };
      });
      const c = (s) => pins.filter((d) => d.st === s).length;
      el.querySelector('#gxHint').textContent = `${pins.length} topics · ${c('learned')} mastered · ${c('learning')} learning · drag to turn, tap a pin`;
      el.querySelector('#gxKey').innerHTML = cats.slice(0, 6).map((k, i) => `<span style="color:rgb(${pal(i).join(',')})"><i style="background:rgb(${pal(i).join(',')})"></i>${esc(k.name)}</span>`).join('') + '<span>Tall = mastered · ring = learning now · short = bucket · specks = suggestions</span>';
      const cur = pins.find((d) => d.st === 'learning');
      if (cur) { lock.hidden = false; lock.href = '#'; lock.innerHTML = `<small>LEARNING NOW · ${esc(cur.cat)}</small><b>${esc(cur.name)}</b>Tap to open`; lock.onclick = (e) => { e.preventDefault(); window.LGApp && window.LGApp.openTopic(cur.id); }; } else lock.hidden = true;
    }
    subs.push((c) => (c === 'topics' || c === 'categories') && rebuild());
    const cv = canvasLoop(el, draw);
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw, tilt }; moved = 0; el.classList.add('drag'); cv.setPointerCapture(e.pointerId); auto = 0; });
    cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; if (!drag) return; moved += Math.abs(e.movementX) + Math.abs(e.movementY); yaw = drag.yaw + (e.clientX - drag.x) * 0.006; tilt = Math.max(0.35, Math.min(1.25, drag.tilt + (e.clientY - drag.y) * 0.004)); });
    cv.addEventListener('pointerup', () => { const wasDrag = moved > 6; drag = null; el.classList.remove('drag'); setTimeout(() => (auto = 1), 4000); if (!wasDrag && hover && window.LGApp) window.LGApp.openTopic(hover.id); });
    cv.addEventListener('pointerleave', () => { mouse = { x: -1, y: -1 }; });
    function draw(g, W, H, now, dt) {
      const K = kit();
      yaw += dt * 0.045 * auto; beam = (beam + dt * 0.7) % 6.283;
      const cT = Math.cos(tilt), sT = Math.sin(tilt);
      const R = Math.min(W * 0.44, (H - 120) / (2 * Math.max(0.42, cT) + 0.5)), HT = R * 0.5;
      const cx = W / 2, cy = H * 0.5 + R * 0.18;
      const cY = Math.cos(yaw), sY = Math.sin(yaw);
      const P = (r, a, z = 0) => { let x = Math.cos(a) * r, y = Math.sin(a) * r; [x, y] = [x * cY - y * sY, x * sY + y * cY]; const yy = y * cT, zz = y * sT; const k = 3.2 / (3.2 + zz / R * 0.9); return [cx + x * k, cy + yy * k - z * k, zz]; };
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      const bg = g.createRadialGradient(cx, cy - R * 0.4, 0, cx, cy, Math.max(W, H) * 0.85); bg.addColorStop(0, K.bg0); bg.addColorStop(0.4, K.bg1); bg.addColorStop(1, K.bg2); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // soft disc glow
      g.save(); g.translate(cx, cy); g.scale(1, Math.max(0.2, cT)); const dg = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.1); dg.addColorStop(0, K.c(.20)); dg.addColorStop(0.6, K.c(.06)); dg.addColorStop(1, K.c(0)); g.fillStyle = dg; g.beginPath(); g.arc(0, 0, R * 1.1, 0, 7); g.fill(); g.restore();
      // subject wedges: a faint tint per subject
      const n = cats.length;
      for (let i = 0; i < n; i++) {
        const a0 = i / n * 6.283, a1 = (i + 1) / n * 6.283; g.beginPath(); { const [x, y] = P(0.1 * R, a0); g.moveTo(x, y); }
        for (let k = 0; k <= 24; k++) { const [x, y] = P(R, a0 + (a1 - a0) * k / 24); g.lineTo(x, y); }
        for (let k = 24; k >= 0; k--) { const [x, y] = P(0.1 * R, a0 + (a1 - a0) * k / 24); g.lineTo(x, y); }
        g.closePath(); g.fillStyle = `rgba(${pal(i).join(',')},.045)`; g.fill();
        const [x0, y0] = P(0.1 * R, a0), [x1, y1] = P(R, a0); g.strokeStyle = K.c(.16); g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      // stage rings (thin), rim (bright), outer dashed ring, rim ticks
      const ring = (r, a, w = 1, dash) => { g.strokeStyle = `${K.c(a)}`; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); for (let k = 0; k <= 120; k++) { const [x, y] = P(r * R, k / 120 * 6.283); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.setLineDash([]); };
      ring(0.1, 0.35); for (const b of BANDS) ring(b[3], 0.14, 1, [3, 5]);
      ring(1.0, 0.6, 1.5); ring(1.07, 0.16, 1, [2, 7]);
      for (let i = 0; i < 144; i++) { const a = i / 144 * 6.283; const [x1, y1] = P(R, a), [x2, y2] = P(R * (i % 12 ? 1.02 : 1.045), a); g.strokeStyle = `${K.c(i % 12 ? 0.3 : 0.6)}`; g.lineWidth = 1; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
      // subject names on the rim
      g.font = '700 12.5px Manrope, system-ui';
      for (let i = 0; i < n; i++) { const [lx, ly] = P(R * 1.15, (i + 0.5) / n * 6.283); const name = cats[i].name; const tw = g.measureText(name).width / 2 + 10;
        g.fillStyle = `rgba(${pal(i).join(',')},.95)`; g.textAlign = 'center'; g.fillText(name, Math.max(tw, Math.min(W - tw, lx)), Math.min(H - 40, ly + 4)); g.textAlign = 'left'; }
      // sweep wedge
      g.beginPath(); { const [x, y] = P(0, 0); g.moveTo(x, y); } for (let k = 0; k <= 28; k++) { const [x, y] = P(R, beam - 0.6 + k / 28 * 0.6); g.lineTo(x, y); } g.closePath();
      const [bx, by] = P(R, beam); const sg = g.createLinearGradient(cx, cy, bx, by); sg.addColorStop(0, K.c(.03)); sg.addColorStop(1, K.b(.2)); g.fillStyle = sg; g.fill();
      g.strokeStyle = K.b(.8); g.lineWidth = 1.4; g.shadowColor = K.glow; g.shadowBlur = 10; g.beginPath(); { const [x, y] = P(0, 0); g.moveTo(x, y); } g.lineTo(bx, by); g.stroke(); g.shadowBlur = 0;
      // holographic dust rising off the disc
      if (!dust) { let s = 3; const r2 = () => (s = (s * 16807) % 2147483647) / 2147483647; dust = Array.from({ length: 90 }, () => ({ r: Math.sqrt(r2()) * 0.95, a: r2() * 6.283, z: r2(), v: 0.03 + r2() * 0.06 })); }
      for (const d of dust) { d.z += d.v * dt; if (d.z > 1) d.z = 0; const [x, y] = P(d.r * R, d.a, d.z * HT * 1.2); g.globalAlpha = 0.5 * Math.sin(Math.PI * d.z); g.fillStyle = K.mid; g.fillRect(x, y, 1.4, 1.4); }
      g.globalAlpha = 1;
      // core emitter
      { const [x, y] = P(0, 0); const pg = g.createLinearGradient(x, y, x, y - HT * 0.7); pg.addColorStop(0, K.b(.8)); pg.addColorStop(1, K.b(0)); g.strokeStyle = pg; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - HT * 0.7); g.stroke();
        g.fillStyle = K.hi; g.shadowColor = K.glow; g.shadowBlur = 18; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.shadowBlur = 0;
        const k = (now / 1800) % 1; g.strokeStyle = `${K.b(0.6 * (1 - k))}`; g.beginPath(); g.ellipse(x, y, 6 + k * R * 0.12, (6 + k * R * 0.12) * Math.max(0.25, cT), 0, 0, 7); g.stroke(); }
      // pins, back to front
      const list = pins.map((p) => { const [bx2, by2, z] = P(p.rad * R, p.ang); return { p, bx: bx2, by: by2, z }; }).sort((a, b) => b.z - a.z);
      hover = null; let best = 14; const labels = [];
      for (const { p, bx: x, by: y } of list) {
        let diff = (beam - p.ang) % 6.283; if (diff < 0) diff += 6.283; if (diff < 0.06) p.lit = 1; p.lit = Math.max(0, p.lit - dt * 0.4);
        const rgb = p.col.join(',');
        if (p.st === 'suggested') { // dim specks on the disc, no stem
          g.globalAlpha = 0.28 + p.lit * 0.5; g.fillStyle = `rgb(${rgb})`; g.fillRect(x - 1, y - 1, 2, 2);
          const dd = Math.hypot(mouse.x - x, mouse.y - y); if (dd < best) { best = dd; hover = { p, x, y }; } continue;
        }
        const h = p.ht * HT * (p.st === 'learning' ? 1 + 0.05 * Math.sin(now / 420 + p.rad * 10) : 1); const top = y - h * Math.max(0.4, sT);
        const a = p.st === 'todo' ? 0.75 : 1;
        // base ring on the disc
        g.globalAlpha = 0.55 * a; g.strokeStyle = `rgba(${rgb},.7)`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, 3.5, 3.5 * Math.max(0.25, cT), 0, 0, 7); g.stroke();
        // stem
        const sg2 = g.createLinearGradient(x, y, x, top); sg2.addColorStop(0, `rgba(${rgb},.05)`); sg2.addColorStop(1, `rgba(${rgb},${0.8 * a})`); g.globalAlpha = 1; g.strokeStyle = sg2; g.lineWidth = p.st === 'todo' ? 1 : 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, top); g.stroke();
        const size = (p.st === 'learned' ? 4.6 : p.st === 'learning' ? 4.8 : 2.8) + 1.5 * p.lit;
        g.globalAlpha = Math.min(1, a + p.lit * 0.5); g.fillStyle = `rgb(${rgb})`; g.shadowColor = `rgb(${rgb})`; g.shadowBlur = (p.st === 'todo' ? 5 : 14) + 12 * p.lit; g.beginPath(); g.arc(x, top, size, 0, 7); g.fill(); g.shadowBlur = 0;
        if (p.st !== 'todo') { g.fillStyle = K.hi; g.globalAlpha = 0.9; g.beginPath(); g.arc(x, top, size * 0.4, 0, 7); g.fill(); labels.push({ p, x, y: top }); }
        if (p.st === 'learning') { const k = (now / 1500 + p.rad) % 1; g.globalAlpha = 0.7 * (1 - k); g.strokeStyle = `rgb(${rgb})`; g.lineWidth = 1.1; g.beginPath(); g.arc(x, top, 7 + k * 15, 0, 7); g.stroke(); }
        const dd = Math.hypot(mouse.x - x, mouse.y - top); if (dd < best) { best = dd; hover = { p, x, y: top }; }
      }
      // floating names for mastered + learning pins
      g.globalAlpha = 1; g.font = '600 11.5px Manrope, system-ui';
      const placed = []; for (const l of labels.slice(0, 14)) { const txt = l.p.name.length > 26 ? l.p.name.slice(0, 25) + '…' : l.p.name; const w = g.measureText(txt).width;
        const lx = Math.max(6, Math.min(W - w - 14, l.x + 9)), ly = l.y - 9; if (placed.some((q) => lx < q[0] + q[2] + 6 && lx + w + 6 > q[0] && Math.abs(ly - q[1]) < 18)) continue; placed.push([lx, ly, w]);
        g.fillStyle = K.plate; g.beginPath(); g.roundRect ? g.roundRect(lx - 5, ly - 12, w + 10, 17, 8) : g.rect(lx - 5, ly - 12, w + 10, 17); g.fill();
        g.fillStyle = `rgb(${l.p.col.join(',')})`; g.fillText(txt, lx, ly); }
      if (hover) {
        g.strokeStyle = `rgb(${hover.p.col.join(',')})`; g.lineWidth = 1.4; g.beginPath(); g.arc(hover.x, hover.y, 10, 0, 7); g.stroke(); cv.style.cursor = 'pointer';
        tip.style.display = 'block'; tip.style.left = Math.min(hover.x, W - 265) + 'px'; tip.style.top = hover.y + 'px';
        tip.innerHTML = `<small style="color:rgb(${hover.p.col.join(',')})">${esc(hover.p.cat)} · ${hover.p.stage}</small><b>${esc(hover.p.name)}</b>Tap to open`;
      } else { tip.style.display = 'none'; cv.style.cursor = ''; }
    }
    rebuild();
  }

  /* =====================================================================
   * JARVIS GYRO CORE: three rings turning on their own 3D axes around a glowing sphere,
   * a circular equaliser that dances with the voice, orbiting sparks, a rotating text ring.
   * ===================================================================== */
  function mountJarvisCore() {
    const log = document.getElementById('jLog'); if (!log || document.querySelector('.j-core')) return;
    const el = document.createElement('div'); el.className = 'j-core'; el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="st" id="jcSt">Online</div>';
    log.parentNode.insertBefore(el, log);
    const st = el.querySelector('#jcSt'); let energy = 0.2, t = 0, mode = 'idle', lvl = new Float32Array(64);
    let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sparks = Array.from({ length: 70 }, () => ({ r: 0.55 + rnd() * 0.5, a: rnd() * 6.283, tilt: (rnd() - 0.5) * 1.6, sp: 0.2 + rnd() * 0.8, s: rnd() }));
    const gyros = [{ r: 0.62, ax: 1.15, sp: 0.55, seg: [0.9, 0.25, 1.6, 0.4, 0.6, 0.3] }, { r: 0.74, ax: -0.7, sp: -0.38, seg: [2.2, 0.3, 0.5, 0.35] }, { r: 0.86, ax: 0.35, sp: 0.24, seg: [0.25, 0.12] }];
    const TEXT = 'J.A.R.V.I.S · LEARNING GALAXY · ONLINE · ';
    canvasLoop(el, (g, W, H, now, dt) => {
      const K = kit();
      t += dt; const orb = document.getElementById('orb'); const sub = (document.getElementById('jSub') || {}).textContent || '';
      mode = /Speaking/i.test(sub) ? 'speaking' : /Listening/i.test(sub) ? 'listening' : (orb && orb.classList.contains('busy')) || /Thinking/i.test(sub) ? 'thinking' : 'idle';
      st.textContent = { idle: 'Online', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' }[mode];
      energy += ({ idle: 0.2, listening: 0.55, thinking: 0.95, speaking: 0.7 }[mode] - energy) * Math.min(1, dt * 3);
      const voice = mode === 'speaking' ? 0.35 + 0.65 * Math.abs(Math.sin(t * 8.3) * Math.sin(t * 2.9)) : mode === 'listening' ? 0.25 + 0.6 * Math.abs(Math.sin(t * 4.7) * Math.sin(t * 1.3)) : 0.04;
      const cx = W / 2, cy = H / 2 - 12, R = Math.min(W * 0.38, H * 0.38); const sp = 0.6 + energy * 2;
      g.clearRect(0, 0, W, H); g.globalAlpha = 1;
      // halo
      const hg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25); hg.addColorStop(0, `${K.c(0.1 + energy * 0.1)}`); hg.addColorStop(1, K.c(0)); g.fillStyle = hg; g.fillRect(0, 0, W, H);
      // rotating text ring (flat)
      g.save(); g.translate(cx, cy); g.rotate(-t * 0.08 * sp); g.font = '500 8.5px "JetBrains Mono", monospace'; g.fillStyle = K.b(.5);
      const chars = (TEXT + TEXT).split(''); const step = 6.283 / chars.length; chars.forEach((ch, i) => { g.save(); g.rotate(i * step); g.translate(0, -R * 1.02); g.fillText(ch, -2.5, 0); g.restore(); }); g.restore();
      // outer tick ring
      g.save(); g.translate(cx, cy); g.rotate(t * 0.05 * sp); for (let i = 0; i < 90; i++) { const a = i / 90 * 6.283, L = i % 15 ? 3 : 7; g.strokeStyle = `${K.c(i % 15 ? 0.35 : 0.7)}`; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.94, Math.sin(a) * R * 0.94); g.lineTo(Math.cos(a) * (R * 0.94 - L), Math.sin(a) * (R * 0.94 - L)); g.stroke(); } g.restore();
      // circular equaliser
      for (let i = 0; i < 64; i++) { const target = voice * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.7 + t * 6) * Math.sin(i * 0.23 - t * 3.1))); lvl[i] += (target - lvl[i]) * Math.min(1, dt * 12); }
      g.save(); g.translate(cx, cy); g.lineCap = 'round';
      for (let i = 0; i < 64; i++) { const a = i / 64 * 6.283 - Math.PI / 2; const r0 = R * 0.3, r1 = r0 + R * (0.02 + lvl[i] * 0.22); g.strokeStyle = K.light ? `rgba(${30 + lvl[i] * 20},${100 + lvl[i] * 40},${200 + lvl[i] * 40},${0.45 + lvl[i] * 0.5})` : `rgba(${140 + lvl[i] * 100},${220 + lvl[i] * 30},255,${0.35 + lvl[i] * 0.6})`; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
      g.restore();
      // gyroscope rings: circles on tilted planes, back half dim, front half bright, segmented
      const drawGyro = (gy, front) => {
        const rot = t * gy.sp * sp, ax = gy.ax + Math.sin(t * 0.3) * 0.15; const cA = Math.cos(ax), sA = Math.sin(ax), cR = Math.cos(rot * 0.6), sR = Math.sin(rot * 0.6);
        let segI = 0, segLeft = gy.seg[0], on = true; const N = 140;
        for (let k = 0; k < N; k++) {
          const a0 = k / N * 6.283 + rot, a1 = (k + 1) / N * 6.283 + rot; segLeft -= 6.283 / N; if (segLeft <= 0) { segI = (segI + 1) % gy.seg.length; segLeft = gy.seg[segI]; on = !on; }
          if (!on) continue;
          const pt = (a) => { let x = Math.cos(a) * gy.r * R, y = Math.sin(a) * gy.r * R, z = 0; [y, z] = [y * cA, y * sA]; [x, z] = [x * cR - z * sR, x * sR + z * cR]; return [cx + x, cy + y, z]; };
          const [x0, y0, z0] = pt(a0), [x1, y1] = pt(a1); const isFront = z0 < 0; if (isFront !== front) continue;
          g.strokeStyle = front ? `${K.b(0.55 + energy * 0.35)}` : K.c(.18); g.lineWidth = front ? 2 : 1.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
      };
      gyros.forEach((gy) => drawGyro(gy, false));
      // core sphere
      const pulse = 1 + voice * 0.12 + Math.sin(t * 1.6) * 0.02; const cr = R * 0.2 * pulse;
      const sg = g.createRadialGradient(cx - cr * 0.3, cy - cr * 0.35, cr * 0.1, cx, cy, cr); sg.addColorStop(0, K.hi); sg.addColorStop(0.35, K.mid); sg.addColorStop(0.8, '#1f6fc0'); sg.addColorStop(1, K.rim);
      g.shadowColor = K.glow; g.shadowBlur = 24 + voice * 30; g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = K.b(.6); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.stroke();
      // latitude lines on the sphere
      g.save(); g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.clip(); g.strokeStyle = K.b(.25); for (let k = -2; k <= 2; k++) { g.beginPath(); g.ellipse(cx, cy + k * cr * 0.33, cr * Math.sqrt(1 - (k * 0.33) ** 2), cr * 0.12, 0, 0, 7); g.stroke(); }
      const lon = (t * 0.8 * sp) % 6.283; for (let k = 0; k < 3; k++) { const w = Math.cos(lon + k * 1.05) * cr; g.beginPath(); g.ellipse(cx, cy, Math.abs(w), cr, 0, 0, 7); g.stroke(); } g.restore();
      gyros.forEach((gy) => drawGyro(gy, true));
      // sparks
      for (const s of sparks) { s.a += dt * s.sp * sp * 0.6; const x = Math.cos(s.a) * s.r * R, y = Math.sin(s.a) * s.r * R * Math.cos(s.tilt); const z = Math.sin(s.a) * Math.sin(s.tilt); g.globalAlpha = (0.25 + 0.5 * (1 - (z + 1) / 2)) * (0.6 + energy * 0.5); g.fillStyle = s.s < 0.15 ? K.hi : K.mid; const sz = s.s < 0.15 ? 2 : 1.2; g.fillRect(cx + x, cy + y, sz, sz); }
      g.globalAlpha = 1;
      // thinking: a bright arc racing around
      if (mode === 'thinking') { const a = t * 5; g.strokeStyle = K.b(.95); g.lineWidth = 2.5; g.shadowColor = K.glow; g.shadowBlur = 14; g.beginPath(); g.arc(cx, cy, R * 0.94, a, a + 0.7); g.stroke(); g.beginPath(); g.arc(cx, cy, R * 0.94, a + Math.PI, a + Math.PI + 0.7); g.stroke(); g.shadowBlur = 0; }
    });
  }

  /* =====================================================================
   * RADAR
   * ===================================================================== */
  const KINDSL = [[0, 120, 205], [0, 150, 105], [200, 120, 0], [118, 74, 230], [205, 50, 105], [190, 130, 0], [200, 40, 40]];
  const KINDS = [['launch', 'Launches', [94, 200, 255]], ['repo', 'Repos', [61, 220, 151]], ['paper', 'Papers', [255, 181, 71]], ['article', 'Articles', [182, 156, 255]], ['practice', 'Practice', [255, 138, 170]], ['tool', 'Tools', [255, 214, 102]], ['video', 'Videos', [255, 99, 99]]];
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
        return { n, get col() { return isLight() ? KINDSL[ki] : KINDS[ki][2]; }, kind: KINDS[ki][1], ang, rad: 0.14 + 0.8 * Math.min(1, 0.65 * Math.min(1, age / span) + 0.35 * hash((n.id || n.title) + 'r')), lit: 0 };
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
      const K = kit();
      const cx = W / 2, cy = H / 2 + 16, R = Math.min(W, H) * 0.42; beam = (beam + dt * 1.25) % 6.283;
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7); bg.addColorStop(0, K.bg0); bg.addColorStop(0.45, K.bg1); bg.addColorStop(1, K.bg2); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // rings, cross, ticks
      g.strokeStyle = K.c(.22); g.lineWidth = 1; for (let i = 1; i <= 4; i++) { g.beginPath(); g.arc(cx, cy, R * i / 4, 0, 7); g.stroke(); }
      g.strokeStyle = K.c(.5); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
      g.strokeStyle = K.c(.14); g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
      for (let i = 0; i < 72; i++) { const a = i / 72 * 6.283, L = i % 6 ? 4 : 9; g.strokeStyle = K.c(.45); g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R + L), cy + Math.sin(a) * (R + L)); g.stroke(); }
      // sector dividers
      g.strokeStyle = K.c(.08); for (let k = 0; k < KINDS.length; k++) { const a = k / KINDS.length * 6.283 - Math.PI / 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
      // sweep (trail behind the beam)
      g.save(); g.translate(cx, cy); g.rotate(beam - Math.PI / 2);
      const sw = g.createConicGradient ? g.createConicGradient(0, 0, 0) : null;
      if (sw) { sw.addColorStop(0, K.c(0)); sw.addColorStop(0.75, K.c(0)); sw.addColorStop(0.95, K.c(.18)); sw.addColorStop(1, K.b(.55)); g.fillStyle = sw; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); }
      g.strokeStyle = K.b(.9); g.lineWidth = 2; g.shadowColor = K.glow; g.shadowBlur = 12; g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0); g.stroke(); g.restore();
      // blips: light up when the beam passes, then fade
      hover = null; let best = 14;
      for (const b of blips) {
        const a = b.ang - Math.PI / 2; const x = cx + Math.cos(a) * b.rad * R, y = cy + Math.sin(a) * b.rad * R; b.x = x; b.y = y;
        let diff = (beam - b.ang) % 6.283; if (diff < 0) diff += 6.283; if (diff < 0.08) b.lit = 1; b.lit = Math.max(0, b.lit - dt * 0.28);
        const d = Math.hypot(mouse.x - x, mouse.y - y); if (d < best) { best = d; hover = b; }
        const a2 = (K.light ? 0.62 : 0.3) + (K.light ? 0.38 : 0.7) * b.lit; g.globalAlpha = a2; g.fillStyle = `rgb(${b.col.join(',')})`; g.shadowColor = `rgb(${b.col.join(',')})`; g.shadowBlur = 6 + 18 * b.lit;
        g.beginPath(); g.arc(x, y, 3.2 + 2.2 * b.lit, 0, 7); g.fill(); g.shadowBlur = 0;
      }
      g.globalAlpha = 1; g.fillStyle = K.hi; g.shadowColor = K.glow; g.shadowBlur = 18; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill(); g.shadowBlur = 0;
      if (hover) {
        g.strokeStyle = `rgb(${hover.col.join(',')})`; g.lineWidth = 1.4; g.beginPath(); g.arc(hover.x, hover.y, 10, 0, 7); g.stroke(); cv.style.cursor = 'pointer';
        tip.style.display = 'block'; tip.style.left = Math.min(hover.x, W - 265) + 'px'; tip.style.top = hover.y + 'px';
        tip.innerHTML = `<small style="color:rgb(${hover.col.join(',')})">${esc(hover.kind)} · ${esc(hover.n.source || '')}</small><b>${esc(hover.n.title)}</b>${esc(String(hover.n.date || hover.n.added || '').slice(0, 10))}`;
      } else { tip.style.display = 'none'; cv.style.cursor = ''; }
    }
    rebuild();
  }

  LG.store.ready.then(() => {
    if (!LG.store.db) return; // no database in this view
    watch('categories'); watch('topics'); watch('news', LG.store.db.collection('news').orderBy('date', 'desc').limit(80));
    const safe = (fn) => { try { fn(); } catch (e) { console.warn('lg-visuals', e); } };
    const go = () => { safe(mountJarvisCore); safe(mountGalaxy); safe(mountRadar); };
    setInterval(() => { if (!document.querySelector('.j-core')) safe(mountJarvisCore); }, 2000);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  });
})();
