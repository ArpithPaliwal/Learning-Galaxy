/* Learning Galaxy — Krishna, the same pet as the Hermes desktop app.
 * Exact Hermes renderer behaviour: petdex sheet 192x208 cells (8 cols x 9 rows), 6 frames per state, one loop = 1100 ms,
 * high-quality smoothing, drawn at scale 0.45 (Arpit's display.pet.scale) → 86x94 CSS px.
 * State priority (same as Hermes): failed > jump (celebrate) > wave (just completed) > waiting > run > review > idle.
 *   Jarvis thinking → review · Hermes working → run · waiting for the PC → waiting · Hermes done → wave
 *   topic mastered / plan item done → jump · error → failed. Drag to move (remembered); × hides; 🦚 brings him back. */
(function () {
  'use strict';
  const FW = 192, FH = 208, FRAMES = 6, LOOP_MS = 1100, SCALE = 0.45;
  const ROWS = ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'];
  const ROW = { idle: 0, wave: 3, jump: 4, failed: 5, waiting: 6, run: 7, review: 8 };
  const LS = { get: (k, d) => { try { const v = localStorage.getItem('lg.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('lg.' + k, JSON.stringify(v)); } catch (e) {} } };
  if (LS.get('petsOff', false)) { recall(); return; }

  const W = Math.round(FW * SCALE), H = Math.round(FH * SCALE);
  const css = document.createElement('style');
  css.textContent = `
  .lgpet{position:fixed;z-index:60;right:var(--pet-r,18px);bottom:var(--pet-b,10px);width:${W}px;height:${H}px;cursor:grab;touch-action:none;user-select:none}
  .lgpet.drag{cursor:grabbing}
  .lgpet canvas{width:${W}px;height:${H}px;display:block}
  .lgpet .x{position:absolute;right:-6px;top:-6px;width:18px;height:18px;border-radius:50%;border:0;background:rgb(10 14 24 / .75);color:#fff;font-size:12px;line-height:18px;cursor:pointer;opacity:0;transition:opacity .2s}
  .lgpet:hover .x{opacity:1}
  @media (max-width:1100px){ body.jopen .lgpet{display:none} }
  @media (max-width:640px){ .lgpet{bottom:calc(74px + env(safe-area-inset-bottom,0px))!important} }`;
  document.head.appendChild(css);

  const el = document.createElement('div'); el.className = 'lgpet'; el.title = 'Krishna'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Krishna');
  el.innerHTML = '<canvas></canvas><button class="x" title="Hide Krishna" aria-label="Hide">×</button>';
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  const img = new Image(); img.src = 'pets/krishna.webp';

  function dpr() { const d = window.devicePixelRatio; return Number.isFinite(d) && d > 0 ? d : 1; }
  let frame = 0, lastStep = 0, last = -1, lastRow = -1, row = 0;
  function fit() { const d = dpr(); cv.width = Math.round(W * d); cv.height = Math.round(H * d); last = -1; }
  fit(); addEventListener('resize', fit);

  /* ---------- state (same derivation as Hermes) ---------- */
  const flags = { error: false, celebrate: false, justCompleted: false, awaitingInput: false, toolRunning: false, reasoning: false, busy: false };
  let flashT;
  function flash(f, ms = 1600) { Object.assign(flags, { error: false, celebrate: false, justCompleted: false }, f); clearTimeout(flashT); flashT = setTimeout(() => Object.assign(flags, { error: false, celebrate: false, justCompleted: false }), ms); }
  const stateOf = (e) => e.error ? 'failed' : e.celebrate ? 'jump' : e.justCompleted ? 'wave' : e.awaitingInput ? 'waiting' : e.toolRunning ? 'run' : e.reasoning ? 'review' : e.busy ? 'run' : 'idle';

  /* ---------- draw loop (6 frames / 1100 ms, high-quality smoothing) ---------- */
  function tick(t) {
    const st = stateOf(flags); const r = Math.min(ROW[st] ?? 0, ROWS.length - 1);
    if (r !== row) { row = r; frame = 0; lastStep = t; }
    if (t - lastStep >= LOOP_MS / FRAMES) { frame = (frame + 1) % FRAMES; lastStep = t; }
    if (img.complete && img.naturalWidth > 0 && (frame !== last || row !== lastRow)) {
      ctx.clearRect(0, 0, cv.width, cv.height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, frame * FW, row * FH, FW, FH, 0, 0, cv.width, cv.height); last = frame; lastRow = row;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- follow the app ---------- */
  addEventListener('lg-celebrate', () => flash({ celebrate: true }));
  let seenDone = null, seenErr = null;
  setInterval(() => {
    const app = window.LGCore; if (!app) return;
    const herm = [...(app.C('hermes') || new Map()).values()];
    const fresh = (() => { const m = app.C('meta').get('hermes'); return !!(m && m.online && Date.now() - Date.parse(m.seen || 0) < 150000); })();
    flags.reasoning = !!app.S.jBusy;
    flags.toolRunning = herm.some((h) => h.status === 'running');
    flags.awaitingInput = !flags.toolRunning && herm.some((h) => h.status === 'pending' && (h.waiting || !fresh));
    flags.busy = flags.reasoning || flags.toolRunning || herm.some((h) => h.status === 'pending');
    const done = new Set(herm.filter((h) => h.status === 'done').map((h) => h.id)), err = new Set(herm.filter((h) => h.status === 'error').map((h) => h.id));
    if (seenDone && [...done].some((i) => !seenDone.has(i))) flash({ justCompleted: true });
    if (seenErr && [...err].some((i) => !seenErr.has(i))) flash({ error: true });
    seenDone = done; seenErr = err;
  }, 1000);

  /* ---------- place (left of Jarvis on desktop) + drag ---------- */
  let drag = null, moved = false;
  function place() {
    if (drag) return;
    const pos = LS.get('petPos', null);
    if (pos && innerWidth > 640) { el.style.setProperty('--pet-r', Math.max(0, Math.min(innerWidth - W, pos.r)) + 'px'); el.style.setProperty('--pet-b', Math.max(0, Math.min(innerHeight - H, pos.b)) + 'px'); return; }
    const j = document.querySelector('#jarvis'); const r = j && innerWidth > 1100 && getComputedStyle(j).display !== 'none' ? j.getBoundingClientRect() : null;
    el.style.setProperty('--pet-r', (r && r.width ? innerWidth - r.left + 16 : 16) + 'px'); el.style.setProperty('--pet-b', '10px');
  }
  place(); addEventListener('resize', place); setInterval(place, 2500);
  el.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('x')) return; const cs = getComputedStyle(el); drag = { x: e.clientX, y: e.clientY, r: parseFloat(cs.right), b: parseFloat(cs.bottom) }; moved = false; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) { moved = true; el.classList.add('drag'); }
    if (moved) { el.style.setProperty('--pet-r', (drag.r - dx) + 'px'); el.style.setProperty('--pet-b', (drag.b - dy) + 'px'); } });
  el.addEventListener('pointerup', () => { if (drag && moved) { const cs = getComputedStyle(el); LS.set('petPos', { r: parseFloat(cs.right), b: parseFloat(cs.bottom) }); } drag = null; el.classList.remove('drag'); });
  el.addEventListener('click', (e) => {
    if (e.target.classList.contains('x')) { LS.set('petsOff', true); el.remove(); recall(); return; }
    if (!moved) flash({ justCompleted: true }, 1600); // tap → he waves, like in Hermes
  });

  function recall() {
    const b = document.createElement('button'); b.textContent = '🦚'; b.title = 'Bring back Krishna';
    b.style.cssText = 'position:fixed;right:12px;bottom:10px;z-index:59;border:0;background:none;font-size:18px;opacity:.4;cursor:pointer';
    b.onmouseenter = () => (b.style.opacity = '1'); b.onmouseleave = () => (b.style.opacity = '.4');
    b.onclick = () => { LS.set('petsOff', false); location.reload(); };
    (document.body ? Promise.resolve() : new Promise((r) => addEventListener('DOMContentLoaded', r))).then(() => document.body.appendChild(b));
  }
})();
