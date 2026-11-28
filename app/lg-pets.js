/* Learning Galaxy — Krishna & Radha, together in the galaxy.
 * Two pixel-art companions (petdex sheet layout: 8 cols x 9 rows, frames 96x104 here) that stand side by side
 * and react to the app: idle, Jarvis/Hermes thinking (running), task done (jump), problem (sad), tap = wave + heart.
 * Hidden with the × (remembered). Rows: 0 idle · 1 run→ · 2 run← · 3 wave · 4 jump · 5 failed · 6 waiting · 7 running · 8 review */
(function () {
  'use strict';
  const FW = 96, FH = 104, FPS = 7;
  const ROWS = { idle: [0, 6], right: [1, 8], left: [2, 8], wave: [3, 4], jump: [4, 5], failed: [5, 8], waiting: [6, 6], running: [7, 6], review: [8, 6] };
  const LS = { get: (k, d) => { try { const v = localStorage.getItem('lg.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('lg.' + k, JSON.stringify(v)); } catch (e) {} } };
  if (LS.get('petsOff', false)) { addRecall(); return; }

  const css = document.createElement('style');
  css.textContent = `
  .lgpets{position:fixed;z-index:60;right:var(--pets-right,16px);bottom:14px;display:flex;align-items:flex-end;gap:0;pointer-events:none;user-select:none}
  .lgpet{width:${FW}px;height:${FH}px;background-repeat:no-repeat;image-rendering:pixelated;pointer-events:auto;cursor:pointer;transform-origin:50% 100%;
    filter:drop-shadow(0 6px 10px rgba(0,0,0,.45)) drop-shadow(0 0 14px rgba(255,190,120,.18));transition:transform .25s}
  .lgpet:hover{transform:translateY(-3px) scale(1.04)}
  .lgpet.radha{margin-left:-26px}
  .lgpets .aura{position:absolute;left:50%;bottom:-6px;width:170px;height:26px;transform:translateX(-50%);border-radius:50%;
    background:radial-gradient(ellipse,rgba(255,210,140,.35),rgba(120,160,255,.12) 55%,transparent 72%);filter:blur(2px);pointer-events:none}
  .lgpets .heart{position:absolute;left:50%;bottom:86px;font-size:18px;pointer-events:none;animation:lgheart 1.6s ease-out forwards}
  .lgpets .note{position:absolute;bottom:70px;font-size:13px;color:#ffe6a8;text-shadow:0 0 6px #ffb84d;pointer-events:none;animation:lgnote 2.6s ease-out forwards}
  @keyframes lgheart{0%{opacity:0;transform:translate(-50%,10px) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translate(-50%,-46px) scale(1.25)}}
  @keyframes lgnote{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}100%{opacity:0;transform:translate(26px,-60px) rotate(18deg)}}
  .lgpets .bub{position:absolute;bottom:${FH + 6}px;left:50%;transform:translateX(-50%);white-space:nowrap;font:600 11.5px var(--f-body,system-ui);
    padding:4px 10px;border-radius:12px;background:rgba(10,22,44,.82);border:1px solid rgba(255,214,140,.35);color:#fff1d6;backdrop-filter:blur(8px);pointer-events:none;opacity:0;transition:opacity .3s}
  .lgpets .bub.on{opacity:1}
  .lgpets .x{position:absolute;right:-6px;top:-4px;width:18px;height:18px;border-radius:50%;border:0;background:rgba(10,22,44,.8);color:#cfe;font-size:12px;line-height:18px;cursor:pointer;pointer-events:auto;opacity:0;transition:opacity .2s}
  .lgpets:hover .x{opacity:1}
  @media (max-width:1100px){ body.jopen .lgpets{display:none} }
  html[data-theme="light"] .lgpet{filter:drop-shadow(0 6px 8px rgba(30,40,90,.25))}
  @media (max-width:1100px){ .lgpets{right:auto;left:10px;bottom:calc(78px + env(safe-area-inset-bottom,0px))} .lgpet{transform:scale(.78);transform-origin:0 100%} .lgpet.radha{margin-left:-46px} .lgpets .aura{width:130px} }
  @media (max-width:640px){ .lgpets{bottom:calc(84px + env(safe-area-inset-bottom,0px))} .lgpet{transform:scale(.62)} .lgpet.radha{margin-left:-58px} }`;
  document.head.appendChild(css);

  const box = document.createElement('div'); box.className = 'lgpets'; box.setAttribute('aria-label', 'Krishna and Radha');
  box.innerHTML = `<div class="aura"></div><div class="bub"></div><button class="x" title="Hide Krishna & Radha" aria-label="Hide">×</button>
    <div class="lgpet krishna" title="Krishna" style="background-image:url(pets/krishna.webp)"></div>
    <div class="lgpet radha" title="Radha" style="background-image:url(pets/radha.webp)"></div>`;
  document.body.appendChild(box);
  const K = { el: box.querySelector('.krishna'), state: 'idle', f: 0, until: 0, flip: false };
  const R = { el: box.querySelector('.radha'), state: 'idle', f: 3, until: 0, flip: true };
  const bub = box.querySelector('.bub');

  function set(p, state, ms) { if (p.state !== state) { p.state = state; p.f = 0; } p.until = ms ? Date.now() + ms : 0; }
  function draw(p) {
    const [row, n] = ROWS[p.state] || ROWS.idle; p.f = (p.f + 1) % n;
    p.el.style.backgroundPosition = `-${p.f * FW}px -${row * FH}px`;
    if (p.until && Date.now() > p.until) { p.until = 0; p.state = 'idle'; p.f = 0; }
  }
  let bubT; function say(t, ms = 2600) { bub.textContent = t; bub.classList.add('on'); clearTimeout(bubT); bubT = setTimeout(() => bub.classList.remove('on'), ms); }
  function fx(cls, txt, left) { const s = document.createElement('span'); s.className = cls; s.textContent = txt; if (left != null) s.style.left = left + 'px'; box.appendChild(s); setTimeout(() => s.remove(), 2700); }

  // tap: they wave at you and at each other
  const LINES = ['Radhe Radhe ✨', 'Keep going, one topic at a time 🪷', 'Breadth today, depth tomorrow 🌌', 'Learn with love 🦚', 'Hare Krishna 🙏'];
  box.addEventListener('click', (e) => {
    if (e.target.classList.contains('x')) { LS.set('petsOff', true); box.remove(); addRecall(); return; }
    set(K, 'wave', 1800); set(R, 'wave', 1800); fx('heart', '💗'); say(LINES[Math.floor(Math.random() * LINES.length)]);
  });

  // react to the app (Jarvis thinking, Hermes jobs, things finishing)
  let lastBusy = false, lastDone = 0, lastErr = 0;
  function mood() {
    const app = window.LGCore; if (!app) return;
    const S = app.S; const herm = [...(app.C('hermes') || new Map()).values()];
    const busy = !!S.jBusy || herm.some((h) => h.status === 'running' || h.status === 'pending');
    const doneAt = Math.max(0, ...herm.filter((h) => h.status === 'done').map((h) => Date.parse(h.updated || h.finished || 0) || 0));
    const errAt = Math.max(0, ...herm.filter((h) => h.status === 'error').map((h) => Date.parse(h.updated || 0) || 0));
    if (busy && !lastBusy) { set(K, 'running'); set(R, 'review'); say(herm.some((h) => h.status === 'running') ? 'Hermes is working on it…' : 'Thinking…', 2200); }
    if (!busy && lastBusy) { set(K, 'jump', 1600); set(R, 'jump', 1600); fx('heart', '💫'); }
    if (lastDone && doneAt > lastDone) { set(K, 'jump', 1600); set(R, 'wave', 1600); say('Done! ✨'); }
    if (lastErr && errAt > lastErr) { set(K, 'failed', 2400); set(R, 'failed', 2400); say('Something went wrong — try again?'); }
    lastBusy = busy; lastDone = doneAt || lastDone || 1; lastErr = errAt || lastErr || 1;
  }

  // ambient life: a flute note now and then, a little wander, an occasional wave between them
  let tick = 0;
  setInterval(() => {
    if (document.hidden) return;
    tick++; mood();
    if (K.state === 'idle' && R.state === 'idle' && tick % (FPS * 9) === 0) {
      const r = Math.random();
      if (r < 0.35) { fx('note', '♪', 34); setTimeout(() => fx('note', '♫', 40), 500); }
      else if (r < 0.55) { set(R, 'wave', 1300); }
      else if (r < 0.7) { set(K, 'waiting', 2500); set(R, 'waiting', 2500); }
    }
    draw(K); draw(R);
  }, 1000 / FPS);

  // keep clear of the desktop sidebar
  // desktop: bottom-right of the main area, just left of the Jarvis panel
  function place() { const j = document.querySelector('#jarvis'); const r = j && innerWidth > 1100 && getComputedStyle(j).display !== 'none' ? j.getBoundingClientRect() : null; box.style.setProperty('--pets-right', (r && r.width ? innerWidth - r.left + 18 : 18) + 'px'); }
  place(); addEventListener('resize', place); setInterval(place, 2000);

  function addRecall() {
    // a tiny 🪷 in the corner brings them back
    const b = document.createElement('button'); b.textContent = '🪷'; b.title = 'Bring back Krishna & Radha';
    b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:59;border:0;background:none;font-size:16px;opacity:.35;cursor:pointer';
    b.onmouseenter = () => (b.style.opacity = '1'); b.onmouseleave = () => (b.style.opacity = '.35');
    b.onclick = () => { LS.set('petsOff', false); location.reload(); };
    (document.body ? Promise.resolve() : new Promise((r) => addEventListener('DOMContentLoaded', r))).then(() => document.body.appendChild(b));
  }
})();
