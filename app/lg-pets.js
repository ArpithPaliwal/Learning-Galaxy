/* Learning Galaxy — Radha & Krishna, together in the galaxy.
 * The illustration (app/pets/radha-krishna.webp, cut out from Arpit's reference art) stands on a glowing hill under a
 * soft sun halo. It is alive: gentle breathing and sway, flute notes drifting from Krishna's flute, petals now and then.
 * Reacts to the app: Jarvis/Hermes thinking → melody; something finished or mastered → petal shower; error → stills.
 * Tap = blessing + hearts · drag = move (remembered) · double-tap = small/large · × = hide (🪷 brings them back). */
(function () {
  'use strict';
  const LS = { get: (k, d) => { try { const v = localStorage.getItem('lg.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('lg.' + k, JSON.stringify(v)); } catch (e) {} } };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (LS.get('petsOff', false)) { recall(); return; }

  const css = document.createElement('style');
  css.textContent = `
  .rk{position:fixed;z-index:60;width:var(--rk-w,190px);aspect-ratio:400/422;right:var(--rk-r,18px);bottom:var(--rk-b,12px);user-select:none;touch-action:none;cursor:grab}
  .rk.drag{cursor:grabbing}
  .rk .sun{position:absolute;left:8%;right:8%;top:4%;aspect-ratio:1;border-radius:50%;pointer-events:none;
    background:radial-gradient(circle,rgb(255 226 150 / .55),rgb(255 200 120 / .22) 45%,transparent 70%);filter:blur(2px);animation:rksun 7s ease-in-out infinite}
  .rk .hill{position:absolute;left:-6%;right:-6%;bottom:-3%;height:16%;border-radius:50%;pointer-events:none;
    background:radial-gradient(ellipse at 50% 40%,rgb(140 190 90 / .55),rgb(90 140 60 / .25) 55%,transparent 72%)}
  .rk .duo{position:absolute;inset:0;background:url(pets/radha-krishna.webp) center bottom/contain no-repeat;transform-origin:50% 96%;
    filter:drop-shadow(0 10px 14px rgb(0 0 0 / .35));animation:rkbreathe 4.2s ease-in-out infinite}
  .rk.sway .duo{animation:rksway 1.6s ease-in-out infinite}
  .rk.hop .duo{animation:rkhop .7s ease-out 2}
  .rk.still .duo{animation:none;filter:drop-shadow(0 10px 14px rgb(0 0 0 / .35)) saturate(.6) brightness(.85)}
  @keyframes rkbreathe{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-2px) scale(1.006,1.014)}}
  @keyframes rksway{0%,100%{transform:rotate(-1.4deg) translateY(-1px)}50%{transform:rotate(1.4deg) translateY(-3px)}}
  @keyframes rkhop{0%,100%{transform:translateY(0) scale(1)}35%{transform:translateY(-14px) scale(1.02,.98)}60%{transform:translateY(0) scale(1.03,.96)}}
  @keyframes rksun{0%,100%{opacity:.85;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
  .rk .fx{position:absolute;pointer-events:none;will-change:transform,opacity}
  .rk .note{left:18%;top:31%;font:700 15px serif;color:#ffd36b;text-shadow:0 0 8px #ffb84d;animation:rknote 3.2s ease-out forwards}
  @keyframes rknote{0%{opacity:0;transform:translate(0,0) scale(.7)}12%{opacity:1}100%{opacity:0;transform:translate(var(--dx,-40px),-90px) rotate(var(--rot,-25deg)) scale(1.15)}}
  .rk .petal{top:-6%;width:10px;height:7px;border-radius:70% 0 70% 0;background:linear-gradient(135deg,#ff8fb4,#e0457b);animation:rkpetal var(--dur,3.6s) linear forwards}
  @keyframes rkpetal{0%{opacity:0;transform:translate(0,0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translate(var(--dx,20px),calc(var(--rk-h,200px) + 30px)) rotate(var(--rot,320deg))}}
  .rk .heart{left:52%;top:36%;font-size:18px;animation:rkheart 1.8s ease-out forwards}
  @keyframes rkheart{0%{opacity:0;transform:translate(-50%,0) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--dx,0px)),-70px) scale(1.3)}}
  .rk .bub{position:absolute;bottom:100%;left:50%;transform:translate(-50%,-4px);width:max-content;max-width:240px;text-align:center;font:600 12.5px/1.35 var(--f-body,system-ui);
    padding:7px 12px;border-radius:14px;background:rgb(255 250 238 / .94);color:#5a2e1c;border:1px solid rgb(224 69 123 / .3);box-shadow:0 10px 30px -14px rgb(120 40 20 / .5);
    pointer-events:none;opacity:0;transition:opacity .35s,transform .35s}
  .rk .bub.on{opacity:1;transform:translate(-50%,-10px)}
  .rk .x{position:absolute;right:2%;top:6%;width:22px;height:22px;border-radius:50%;border:0;background:rgb(10 22 44 / .7);color:#fff;font-size:13px;line-height:22px;cursor:pointer;opacity:0;transition:opacity .2s}
  .rk:hover .x{opacity:1}
  html[data-theme="light"] .rk .sun{background:radial-gradient(circle,rgb(255 214 120 / .65),rgb(255 190 110 / .25) 45%,transparent 70%)}
  @media (max-width:1100px){ .rk{--rk-w:130px!important} body.jopen .rk{display:none} }
  @media (max-width:640px){ .rk{--rk-w:104px!important;bottom:calc(76px + env(safe-area-inset-bottom,0px))!important} }`;
  document.head.appendChild(css);

  const el = document.createElement('div'); el.className = 'rk'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Radha and Krishna');
  el.innerHTML = '<div class="sun"></div><div class="hill"></div><div class="duo"></div><div class="bub"></div><button class="x" title="Hide Radha & Krishna" aria-label="Hide">×</button>';
  document.body.appendChild(el);
  const bub = el.querySelector('.bub');
  const big = () => LS.get('rkBig', false);
  function size() { el.style.setProperty('--rk-w', (big() ? 270 : 190) + 'px'); el.style.setProperty('--rk-h', el.getBoundingClientRect().height + 'px'); }

  /* ---------- placement: default just left of Jarvis; drag to move (remembered) ---------- */
  let drag = null, moved = false;
  function place() {
    if (drag) return;
    const pos = LS.get('rkPos', null);
    if (pos && innerWidth > 640) { el.style.setProperty('--rk-r', Math.max(0, Math.min(innerWidth - 80, pos.r)) + 'px'); el.style.setProperty('--rk-b', Math.max(0, Math.min(innerHeight - 80, pos.b)) + 'px'); return; }
    const j = document.querySelector('#jarvis'); const r = j && innerWidth > 1100 && getComputedStyle(j).display !== 'none' ? j.getBoundingClientRect() : null;
    el.style.setProperty('--rk-r', (r && r.width ? innerWidth - r.left + 14 : 14) + 'px'); el.style.setProperty('--rk-b', '8px');
  }
  size(); place(); addEventListener('resize', () => { size(); place(); }); setInterval(place, 2500);
  el.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('x')) return; const cs = getComputedStyle(el); drag = { x: e.clientX, y: e.clientY, r: parseFloat(cs.right), b: parseFloat(cs.bottom) }; moved = false; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 6) { moved = true; el.classList.add('drag'); }
    if (moved) { el.style.setProperty('--rk-r', (drag.r - dx) + 'px'); el.style.setProperty('--rk-b', (drag.b - dy) + 'px'); } });
  el.addEventListener('pointerup', () => { if (drag && moved) { const cs = getComputedStyle(el); LS.set('rkPos', { r: parseFloat(cs.right), b: parseFloat(cs.bottom) }); } drag = null; el.classList.remove('drag'); });

  /* ---------- effects ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  function fx(cls, txt, vars, life) { const s = document.createElement('span'); s.className = 'fx ' + cls; if (txt) s.textContent = txt; for (const [k, v] of Object.entries(vars || {})) s.style.setProperty(k, v); el.appendChild(s); setTimeout(() => s.remove(), life || 3400); return s; }
  function notes(n = 3) { if (reduce) return; for (let i = 0; i < n; i++) setTimeout(() => fx('note', ['♪', '♫', '♩', '♬'][i % 4], { '--dx': rnd(-70, -20) + 'px', '--rot': rnd(-35, 10) + 'deg' }), i * 420); }
  function petals(n = 14) { if (reduce) return; for (let i = 0; i < n; i++) setTimeout(() => { const p = fx('petal', '', { '--dx': rnd(-40, 40) + 'px', '--rot': rnd(180, 540) + 'deg', '--dur': rnd(2.6, 4.2) + 's' }, 4600); p.style.left = rnd(5, 92) + '%'; }, i * 90); }
  function hearts() { for (let i = 0; i < 3; i++) setTimeout(() => fx('heart', ['💗', '💖', '🪷'][i], { '--dx': rnd(-30, 30) + 'px' }, 2000), i * 220); }
  let bubT; function say(t, ms = 3200) { bub.textContent = t; bub.classList.add('on'); clearTimeout(bubT); bubT = setTimeout(() => bub.classList.remove('on'), ms); }
  let modeT; function mode(m, ms) { el.classList.remove('sway', 'hop', 'still'); if (m) el.classList.add(m); clearTimeout(modeT); if (m && ms) modeT = setTimeout(() => el.classList.remove(m), ms); }

  const BLESS = ['Radhe Radhe 🙏', 'Do your work with love; leave the result — Gita 2.47', 'One topic at a time. Krishna is patient 🪷',
    'Breadth today, depth tomorrow 🌌', 'Learn with devotion, not pressure 🦚', 'Hare Krishna ✨', 'Small steps, every day 🌼'];
  let taps = 0, tapT;
  el.addEventListener('click', (e) => {
    if (moved) return;
    if (e.target.classList.contains('x')) { LS.set('petsOff', true); el.remove(); recall(); return; }
    taps++; clearTimeout(tapT);
    tapT = setTimeout(() => { if (taps >= 2) { LS.set('rkBig', !big()); size(); } else { hearts(); notes(2); mode('sway', 1800); say(BLESS[Math.floor(Math.random() * BLESS.length)]); } taps = 0; }, 260);
  });

  /* ---------- react to the app ---------- */
  addEventListener('lg-celebrate', (e) => { petals(18); mode('hop', 1500); say((e.detail && e.detail.text) || 'Wonderful! ✨', 2600); });
  let lastBusy = false, seenDone = null, seenErr = null;
  setInterval(() => {
    if (document.hidden) return;
    const app = window.LGCore; if (!app) return;
    const herm = [...(app.C('hermes') || new Map()).values()];
    const busy = !!app.S.jBusy || herm.some((h) => h.status === 'running');
    if (busy && !lastBusy) { mode('sway'); notes(3); say(herm.some((h) => h.status === 'running') ? 'Hermes is working on it…' : 'Thinking…', 2200); }
    if (busy && Math.random() < 0.35) notes(1);
    if (!busy && lastBusy) mode('', 0);
    const done = new Set(herm.filter((h) => h.status === 'done').map((h) => h.id)), err = new Set(herm.filter((h) => h.status === 'error').map((h) => h.id));
    if (seenDone && [...done].some((i) => !seenDone.has(i))) { petals(14); mode('hop', 1400); say('Hermes finished ✨'); }
    if (seenErr && [...err].some((i) => !seenErr.has(i))) { mode('still', 2600); say('Something went wrong — try again?'); }
    seenDone = done; seenErr = err; lastBusy = busy;
  }, 1500);

  // ambient: a flute phrase or a few petals now and then
  setInterval(() => { if (document.hidden || reduce || el.classList.contains('sway')) return; const r = Math.random(); if (r < 0.4) notes(3); else if (r < 0.6) petals(4); }, 16000);
  setTimeout(() => { notes(3); say(new Date().getHours() < 12 ? 'Radhe Radhe! Good morning 🌅' : 'Radhe Radhe 🙏', 2600); }, 1800);

  function recall() {
    const b = document.createElement('button'); b.textContent = '🪷'; b.title = 'Bring back Radha & Krishna';
    b.style.cssText = 'position:fixed;right:12px;bottom:10px;z-index:59;border:0;background:none;font-size:18px;opacity:.4;cursor:pointer';
    b.onmouseenter = () => (b.style.opacity = '1'); b.onmouseleave = () => (b.style.opacity = '.4');
    b.onclick = () => { LS.set('petsOff', false); location.reload(); };
    (document.body ? Promise.resolve() : new Promise((r) => addEventListener('DOMContentLoaded', r))).then(() => document.body.appendChild(b));
  }
})();
