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
  .lgpet .petctl{position:absolute;top:-7px;width:22px;height:22px;border-radius:50%;border:1px solid rgb(255 255 255 / .3);background:rgb(10 14 24 / .82);color:#fff;font-size:12px;line-height:20px;padding:0;cursor:pointer;opacity:0;transition:opacity .2s}
  .lgpet .x{right:-7px}.lgpet .walk{right:18px}.lgpet:hover .petctl,.lgpet:focus-within .petctl{opacity:1}
  @media (max-width:1100px){ body.jopen .lgpet{display:none} }
  @media (max-width:640px){ .lgpet{bottom:calc(74px + env(safe-area-inset-bottom,0px))!important}.lgpet .petctl{opacity:.82} }`;
  document.head.appendChild(css);

  const el = document.createElement('div'); el.className = 'lgpet'; el.title = 'Krishna'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Krishna pet controls');
  el.innerHTML = '<canvas></canvas><button class="petctl walk" title="Pause Krishna walking" aria-label="Pause Krishna walking">Ⅱ</button><button class="petctl x" title="Send Krishna away" aria-label="Send Krishna away">×</button>';
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
  let autoWalking = false, walkRow = 'running-right', walkEnd;

  /* ---------- draw loop (6 frames / 1100 ms, high-quality smoothing) ---------- */
  function tick(t) {
    const st = stateOf(flags); const r = st === 'idle' && autoWalking ? ROWS.indexOf(walkRow) : Math.min(ROW[st] ?? 0, ROWS.length - 1);
    if (r !== row) { row = r; frame = 0; lastStep = t; }
    if (t - lastStep >= LOOP_MS / FRAMES) { frame = (frame + 1) % FRAMES; lastStep = t; }
    if (img.complete && img.naturalWidth > 0 && (frame !== last || row !== lastRow)) {
      ctx.clearRect(0, 0, cv.width, cv.height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, frame * FW, row * FH, FW, FH, 0, 0, cv.width, cv.height); last = frame; lastRow = row;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  function walkAround(){
    if (!LS.get('petWalkEnabled', true) || autoWalking || stateOf(flags) !== 'idle' || innerWidth < 500) return;
    const cs = getComputedStyle(el), from = parseFloat(cs.right), bottom = parseFloat(cs.bottom), max = Math.max(16, innerWidth - W - 16);
    let to = Math.round(Math.random() * max); if (Math.abs(to - from) < 120) to = from < max / 2 ? max : 16;
    walkRow = to < from ? 'running-right' : 'running-left'; autoWalking = true; clearTimeout(walkEnd);
    el.style.transition = 'right 5s linear'; el.style.setProperty('--pet-r', to + 'px');
    walkEnd = setTimeout(() => { autoWalking = false; el.style.transition = ''; LS.set('petPos', {r:to,b:bottom}); }, 5200);
  }
  setInterval(walkAround, 30000);

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
    if (drag || autoWalking) return;
    const pos = LS.get('petPos', null);
    if (pos && innerWidth > 640) { el.style.setProperty('--pet-r', Math.max(0, Math.min(innerWidth - W, pos.r)) + 'px'); el.style.setProperty('--pet-b', Math.max(0, Math.min(innerHeight - H, pos.b)) + 'px'); return; }
    const j = document.querySelector('#jarvis'); const r = j && innerWidth > 1100 && getComputedStyle(j).display !== 'none' ? j.getBoundingClientRect() : null;
    el.style.setProperty('--pet-r', (r && r.width ? innerWidth - r.left + 16 : 16) + 'px'); el.style.setProperty('--pet-b', '10px');
  }
  place(); addEventListener('resize', place); setInterval(place, 2500);
  el.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('petctl')) return; const cs = getComputedStyle(el); drag = { x: e.clientX, y: e.clientY, r: parseFloat(cs.right), b: parseFloat(cs.bottom) }; moved = false; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) { moved = true; el.classList.add('drag'); }
    if (moved) { el.style.setProperty('--pet-r', (drag.r - dx) + 'px'); el.style.setProperty('--pet-b', (drag.b - dy) + 'px'); } });
  el.addEventListener('pointerup', () => { if (drag && moved) { const cs = getComputedStyle(el); LS.set('petPos', { r: parseFloat(cs.right), b: parseFloat(cs.bottom) }); } drag = null; el.classList.remove('drag'); });
  el.addEventListener('click', (e) => {
    if (e.target.classList.contains('x')) { LS.set('petsOff', true); clearTimeout(walkEnd); el.remove(); recall(); return; }
    if (e.target.classList.contains('walk')) { const on = !LS.get('petWalkEnabled', true); LS.set('petWalkEnabled', on); autoWalking = false; clearTimeout(walkEnd); el.style.transition = ''; e.target.textContent = on ? 'Ⅱ' : '▶'; e.target.title = on ? 'Pause Krishna walking' : 'Let Krishna walk'; e.target.setAttribute('aria-label', e.target.title); e.stopPropagation(); return; }
    if (!moved) flash({ justCompleted: true }, 1600); // tap → he waves, like in Hermes
  });

  function recall() {
    const b = document.createElement('button'); b.textContent = '🪈 Bring Krishna back'; b.title = 'Bring Krishna back'; b.setAttribute('aria-label','Bring Krishna back');
    b.style.cssText = 'position:fixed;right:12px;bottom:10px;z-index:59;border:1px solid rgb(255 255 255 / .25);border-radius:999px;padding:7px 11px;background:rgb(8 15 25 / .9);color:#fff;font:600 12px system-ui;opacity:.78;cursor:pointer;backdrop-filter:blur(8px)';
    b.onmouseenter = () => (b.style.opacity = '1'); b.onmouseleave = () => (b.style.opacity = '.78');
    b.onclick = () => { LS.set('petsOff', false); b.remove(); location.reload(); };
    (document.body ? Promise.resolve() : new Promise((r) => addEventListener('DOMContentLoaded', r))).then(() => document.body.appendChild(b));
  }
})();
