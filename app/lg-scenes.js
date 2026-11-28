/* Learning Galaxy — theme scenery. A fixed, gently animated SVG landscape behind the app for each theme.
 *   vrindavan  Yamuna river at dawn, kadamba trees, lotus, hills, birds, a peacock on the bank
 *   black      Black glass: pure black, faint aurora + stars so the glass has something to catch
 *   peacock    moonlit forest, fireflies, peacock-feather ferns
 *   stark      Iron Man: arc-reactor glow, rotating HUD rings, hex grid, red/gold scan lines
 *   frost      snowy peaks, pines, falling snow (light default)
 *   space      ringed planet + moon (dark default)
 * Respects prefers-reduced-motion. Sits under the app (z-index 0); glass panels blur it. */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = document.createElement('style');
  css.textContent = `
  #lgScene{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;opacity:0;transition:opacity .9s}
  #lgScene.on{opacity:1}
  #lgScene svg{position:absolute;left:0;bottom:0;width:100%;height:100%}
  html[data-skin] #bgfx,html.has-scene #bgfx{display:none}
  .sc-a{animation:sc-drift 60s linear infinite}
  .sc-tw{animation:sc-tw 3.2s ease-in-out infinite}
  .sc-flow{animation:sc-flow 9s linear infinite}
  .sc-sway{transform-box:fill-box;transform-origin:50% 100%;animation:sc-sway 7s ease-in-out infinite}
  .sc-bird{animation:sc-bird 38s linear infinite}
  .sc-fly{animation:sc-fly 6s ease-in-out infinite}
  .sc-spin{transform-box:fill-box;transform-origin:center;animation:sc-spin 40s linear infinite}
  .sc-spinr{transform-box:fill-box;transform-origin:center;animation:sc-spin 26s linear infinite reverse}
  .sc-pulse{transform-box:fill-box;transform-origin:center;animation:sc-pulse 3.6s ease-in-out infinite}
  .sc-scan{animation:sc-scan 7s linear infinite}
  .sc-snow{animation:sc-snow 14s linear infinite}
  .sc-aur{transform-box:fill-box;transform-origin:center;animation:sc-aur 18s ease-in-out infinite alternate}
  @keyframes sc-drift{to{transform:translateX(-200px)}}
  @keyframes sc-tw{0%,100%{opacity:.25}50%{opacity:1}}
  @keyframes sc-flow{to{stroke-dashoffset:-240}}
  @keyframes sc-sway{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg)}}
  @keyframes sc-bird{from{transform:translateX(-200px)}to{transform:translateX(1900px)}}
  @keyframes sc-fly{0%,100%{transform:translate(0,0);opacity:.2}50%{transform:translate(14px,-18px);opacity:1}}
  @keyframes sc-spin{to{transform:rotate(360deg)}}
  @keyframes sc-pulse{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}
  @keyframes sc-scan{from{transform:translateY(-120px)}to{transform:translateY(1000px)}}
  @keyframes sc-snow{from{transform:translateY(-60px)}to{transform:translateY(960px)}}
  @keyframes sc-aur{from{transform:translateX(-60px) scaleY(1)}to{transform:translateX(60px) scaleY(1.25)}}
  @media (prefers-reduced-motion: reduce){#lgScene *{animation:none!important}}`;
  document.head.appendChild(css);

  const R = (a, b) => a + Math.random() * (b - a);
  const stars = (n, h, cls = 'sc-tw', col = '#fff') => Array.from({ length: n }, () => `<circle cx="${R(0, 1600).toFixed(0)}" cy="${R(0, h).toFixed(0)}" r="${R(0.6, 1.8).toFixed(1)}" fill="${col}" class="${cls}" style="animation-delay:${R(0, 4).toFixed(1)}s"/>`).join('');
  const SVG = (inner, defs = '') => `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>${defs}</defs>${inner}</svg>`;

  /* kadamba tree: trunk + round clustered canopy with small golden flowers */
  function kadamba(x, y, s, c1, c2, delay) {
    const blobs = [[0, -150, 70], [-55, -120, 52], [55, -118, 54], [-30, -190, 46], [32, -186, 48], [0, -95, 46], [-80, -88, 36], [82, -90, 36]];
    const flowers = Array.from({ length: 14 }, () => `<circle cx="${R(-80, 80).toFixed(0)}" cy="${R(-215, -80).toFixed(0)}" r="${R(3, 5).toFixed(1)}" fill="#ffc94a" opacity=".9"/>`).join('');
    return `<g transform="translate(${x} ${y}) scale(${s})"><g class="sc-sway" style="animation-delay:${delay}s">
      <path d="M-9 0 C-7 -40 -12 -70 -4 -110 L6 -110 C12 -70 8 -40 11 0 Z" fill="#6b3f22"/>
      <path d="M0 -80 L-34 -118 M2 -95 L30 -130" stroke="#6b3f22" stroke-width="6" stroke-linecap="round"/>
      ${blobs.map(([bx, by, r], i) => `<circle cx="${bx}" cy="${by}" r="${r}" fill="${i % 2 ? c2 : c1}"/>`).join('')}${flowers}</g></g>`;
  }
  function lotus(x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="6" rx="26" ry="6" fill="#3f8a4a" opacity=".85"/>
      <path d="M0 2 C-6 -10 -4 -22 0 -28 C4 -22 6 -10 0 2Z" fill="#ff9ec0"/><path d="M0 2 C-14 -4 -20 -14 -20 -20 C-10 -18 -4 -10 0 2Z" fill="#ff7fab"/>
      <path d="M0 2 C14 -4 20 -14 20 -20 C10 -18 4 -10 0 2Z" fill="#ff7fab"/></g>`;
  }
  function peacock(x, y, s) {
    const fan = Array.from({ length: 9 }, (_, i) => { const a = -70 + i * 17.5; return `<g transform="rotate(${a})"><path d="M0 0 L-6 -78 Q0 -92 6 -78 Z" fill="#1f7a6e"/><circle cx="0" cy="-74" r="7" fill="#0f5fa8"/><circle cx="0" cy="-74" r="3.5" fill="#ffd166"/></g>`; }).join('');
    return `<g transform="translate(${x} ${y}) scale(${s})" opacity=".92"><g transform="translate(-4 -18)">${fan}</g>
      <path d="M-8 0 C-10 -22 -4 -40 4 -44 C10 -46 12 -38 8 -30 C4 -20 10 -8 14 0 Z" fill="#1b4fa0"/><circle cx="7" cy="-44" r="5" fill="#1b4fa0"/>
      <path d="M11 -45 l8 2 -8 2z" fill="#e0a21e"/><path d="M6 -50 l-2 -8 M8 -50 l1 -8 M10 -49 l3 -7" stroke="#1b4fa0" stroke-width="1.5"/>
      <path d="M-2 0 v10 M6 0 v10" stroke="#8a5a2b" stroke-width="2"/></g>`;
  }

  const SCENES = {
    vrindavan: () => SVG(`
      <rect width="1600" height="900" fill="url(#vsky)"/>
      <circle cx="1240" cy="250" r="130" fill="url(#vsun)"/>
      <g class="sc-a" opacity=".85"><path d="M220 170 q40 -36 90 -8 q30 -26 70 0 q36 2 30 30 h-200 q-20 -10 10 -22z" fill="#fff"/><path d="M1500 120 q30 -26 70 -6 q26 -18 54 0 q26 2 22 24 h-150 q-14 -8 4 -18z" fill="#fff"/><path d="M820 210 q34 -30 76 -6 q24 -22 58 0 q30 2 26 26 h-170 q-16 -10 10 -20z" fill="#fff" opacity=".8"/></g>
      <g fill="none" stroke="#5a3b2a" stroke-width="2.2" stroke-linecap="round">${[0, 1, 2].map(i => `<path class="sc-bird" style="animation-delay:${-i * 11}s" d="M${100 + i * 40} ${180 + i * 30} q8 -8 16 0 q8 -8 16 0"/>`).join('')}</g>
      <path d="M0 560 C220 470 420 520 640 480 C860 440 1040 500 1260 470 C1420 450 1520 480 1600 470 V900 H0Z" fill="#a9c98a" opacity=".75"/>
      <path d="M0 610 C260 560 520 600 800 570 C1080 540 1320 590 1600 560 V900 H0Z" fill="#8db86a"/>
      ${kadamba(150, 640, 1.15, '#3e7d3a', '#4f9447', -1)}${kadamba(380, 600, .8, '#4a8a42', '#3a7536', -3)}${kadamba(1420, 625, 1.05, '#3e7d3a', '#4f9447', -2)}${kadamba(1210, 590, .7, '#4a8a42', '#3a7536', -5)}
      <path d="M-20 900 C200 780 420 760 700 720 C960 684 1180 700 1620 650 V900Z" fill="url(#vriver)"/>
      <g stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity=".55" fill="none" stroke-dasharray="40 200">
        <path class="sc-flow" d="M80 860 C320 790 560 770 820 740 C1080 712 1300 712 1580 690"/>
        <path class="sc-flow" style="animation-delay:-3s" d="M200 890 C440 830 700 800 960 772 C1200 748 1400 742 1600 730"/>
        <path class="sc-flow" style="animation-delay:-6s" d="M500 900 C700 860 900 836 1120 812 C1320 792 1460 782 1600 776"/></g>
      ${lotus(520, 832, 1.2)}${lotus(860, 800, 1)}${lotus(1180, 760, .9)}${lotus(300, 872, 1.1)}
      ${peacock(1010, 690, 1.1)}
      <path d="M0 720 C120 690 180 700 240 760 C170 760 80 800 0 830Z" fill="#7fae5c"/><path d="M1600 700 C1500 680 1430 690 1380 740 C1450 742 1530 770 1600 790Z" fill="#7fae5c"/>`,
      `<linearGradient id="vsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7c2"/><stop offset=".55" stop-color="#fff3dc"/><stop offset="1" stop-color="#fff6e5"/></linearGradient>
       <radialGradient id="vsun"><stop offset="0" stop-color="#ffe08a"/><stop offset=".6" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
       <linearGradient id="vriver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb7e0"/><stop offset="1" stop-color="#2f78b8"/></linearGradient>`),

    black: () => SVG(`
      <rect width="1600" height="900" fill="#000"/>${stars(90, 900, 'sc-tw', '#ffffff')}
      <g class="sc-aur" opacity=".55"><path d="M-100 300 C200 200 500 380 800 260 C1100 140 1400 320 1700 220 L1700 360 C1400 460 1100 290 800 400 C500 520 200 340 -100 440Z" fill="url(#bau1)"/></g>
      <g class="sc-aur" style="animation-delay:-9s" opacity=".35"><path d="M-100 620 C300 520 600 700 900 600 C1200 500 1450 640 1700 560 L1700 700 C1450 780 1200 640 900 740 C600 840 300 660 -100 760Z" fill="url(#bau2)"/></g>`,
      `<linearGradient id="bau1" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#9aa6ff" stop-opacity=".18"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
       <linearGradient id="bau2" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#7fe0ff" stop-opacity=".14"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`),

    peacock: () => SVG(`
      <rect width="1600" height="900" fill="url(#psky)"/>${stars(70, 520)}
      <circle cx="1260" cy="190" r="70" fill="#f4f1d8"/><circle cx="1260" cy="190" r="150" fill="url(#pmoon)"/>
      <path d="M0 640 C200 560 380 600 600 560 C820 520 1000 590 1220 550 C1400 520 1500 560 1600 540 V900H0Z" fill="#0b3a3c"/>
      ${[[120, 700, 1.3], [330, 660, .9], [1450, 690, 1.2], [1250, 650, .8], [760, 640, .7]].map(([x, y, s], i) => kadamba(x, y, s, '#0f4d4f', '#0c4244', -i * 1.7)).join('')}
      <path d="M0 760 C300 700 600 740 900 710 C1200 680 1400 720 1600 700 V900H0Z" fill="#072a2b"/>
      ${peacock(980, 760, 1.2)}
      <g fill="#e9ff8a">${Array.from({ length: 26 }, () => `<circle class="sc-fly" style="animation-delay:${R(0, 6).toFixed(1)}s" cx="${R(0, 1600).toFixed(0)}" cy="${R(520, 860).toFixed(0)}" r="2.2"/>`).join('')}</g>`,
      `<linearGradient id="psky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03141a"/><stop offset="1" stop-color="#06302f"/></linearGradient>
       <radialGradient id="pmoon"><stop offset="0" stop-color="#f4f1d8" stop-opacity=".35"/><stop offset="1" stop-color="#f4f1d8" stop-opacity="0"/></radialGradient>`),

    stark: () => SVG(`
      <rect width="1600" height="900" fill="url(#ssky)"/>
      <g stroke="#ff3b3b" stroke-opacity=".07" fill="none">${(() => { let h = ''; for (let y = 0; y < 920; y += 52) for (let x = (y / 52) % 2 ? 30 : 0; x < 1640; x += 60) h += `<path d="M${x} ${y - 17} l15 -9 15 9 v18 l-15 9 -15 -9z"/>`; return h; })()}</g>
      <g transform="translate(860 560)">
        <circle r="250" fill="url(#sglow)" class="sc-pulse"/>
        <circle r="175" fill="none" stroke="#7df9ff" stroke-opacity=".25" stroke-width="2" stroke-dasharray="6 10" class="sc-spin"/>
        <circle r="140" fill="none" stroke="#f5c542" stroke-opacity=".35" stroke-width="3" stroke-dasharray="80 30 10 30" class="sc-spinr"/>
        <circle r="108" fill="none" stroke="#ff3b3b" stroke-opacity=".45" stroke-width="10" stroke-dasharray="40 14" class="sc-spin"/>
        <circle r="64" fill="#0b1b22" stroke="#7df9ff" stroke-opacity=".7" stroke-width="4"/>
        ${Array.from({ length: 10 }, (_, i) => `<rect x="-6" y="-60" width="12" height="22" rx="3" fill="#bff8ff" opacity=".8" transform="rotate(${i * 36})"/>`).join('')}
        <circle r="30" fill="#e8feff" class="sc-pulse"/><circle r="30" fill="url(#score)"/>
      </g>
      <g opacity=".5" stroke="#f5c542" stroke-width="1.4" fill="none"><path d="M60 120 h220 l20 20 M60 780 h180 l24 -24 M1540 820 h-200"/><circle cx="300" cy="140" r="4" fill="#f5c542"/></g>
      <g font-family="ui-monospace,Consolas,monospace" font-size="13" fill="#ff8a8a" opacity=".45"><text x="64" y="110">J.A.R.V.I.S // MARK LXXXV</text><text x="64" y="804">ARC OUTPUT 3.2 GJ/s · ALL SYSTEMS NOMINAL</text></g>
      <rect class="sc-scan" x="0" y="0" width="1600" height="90" fill="url(#sscan)"/>`,
      `<radialGradient id="ssky" cx=".75" cy=".5" r="1"><stop offset="0" stop-color="#2a0507"/><stop offset=".55" stop-color="#0d0203"/><stop offset="1" stop-color="#040101"/></radialGradient>
       <radialGradient id="sglow"><stop offset="0" stop-color="#7df9ff" stop-opacity=".35"/><stop offset=".4" stop-color="#ff3b3b" stop-opacity=".12"/><stop offset="1" stop-color="#ff3b3b" stop-opacity="0"/></radialGradient>
       <radialGradient id="score"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#7df9ff" stop-opacity="0"/></radialGradient>
       <linearGradient id="sscan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3b3b" stop-opacity="0"/><stop offset=".5" stop-color="#ff3b3b" stop-opacity=".06"/><stop offset="1" stop-color="#ff3b3b" stop-opacity="0"/></linearGradient>`),

    frost: () => SVG(`
      <rect width="1600" height="900" fill="url(#fsky)"/>
      <path d="M0 620 L180 420 L300 520 L470 300 L640 520 L760 430 L920 600 Z" fill="#c9d6f0"/><path d="M470 300 L520 360 L490 352 L470 380 L450 350 L425 362Z" fill="#fff"/>
      <path d="M700 640 L900 380 L1040 520 L1210 330 L1400 560 L1600 470 V700 H700Z" fill="#b8c8ea"/><path d="M1210 330 L1260 392 L1232 386 L1210 412 L1190 384 L1162 392Z" fill="#fff"/>
      <path d="M0 700 C300 650 600 690 900 660 C1200 630 1400 670 1600 650 V900H0Z" fill="#eaf1fd"/>
      ${[[120, 760], [180, 790], [1400, 770], [1480, 800], [1340, 790]].map(([x, y]) => `<path d="M${x} ${y} l-26 0 18 -26 -14 0 16 -24 -12 0 18 -30 18 30 -12 0 16 24 -14 0 18 26z" fill="#6f8fc4"/>`).join('')}
      <g fill="#fff">${Array.from({ length: 60 }, () => `<circle class="sc-snow" style="animation-delay:${R(-14, 0).toFixed(1)}s;animation-duration:${R(10, 18).toFixed(1)}s" cx="${R(0, 1600).toFixed(0)}" cy="0" r="${R(1.2, 3).toFixed(1)}" opacity=".85"/>`).join('')}</g>`,
      `<linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6eeff"/><stop offset="1" stop-color="#f5f8ff"/></linearGradient>`),

    space: () => SVG(`
      ${stars(120, 900)}
      <g transform="translate(1320 700)"><circle r="150" fill="url(#plan)"/><ellipse rx="250" ry="46" fill="none" stroke="#8fdcff" stroke-opacity=".35" stroke-width="10" transform="rotate(-18)"/></g>
      <circle cx="250" cy="170" r="26" fill="#cfe7ff" opacity=".5"/>`,
      `<radialGradient id="plan" cx=".35" cy=".3"><stop offset="0" stop-color="#5ec8ff" stop-opacity=".55"/><stop offset=".7" stop-color="#1b3f8a" stop-opacity=".45"/><stop offset="1" stop-color="#06102a" stop-opacity=".3"/></radialGradient>`),
  };

  const box = document.createElement('div'); box.id = 'lgScene';
  const mount = () => { if (!box.isConnected) document.body.insertBefore(box, document.body.firstChild); };
  let cur = '';
  function apply() {
    const h = document.documentElement; const skin = h.getAttribute('data-skin') || (h.getAttribute('data-theme') === 'light' ? 'frost' : 'space');
    if (skin === cur) return; cur = skin;
    const make = SCENES[skin]; box.classList.remove('on');
    setTimeout(() => { box.innerHTML = make ? make() : ''; h.classList.toggle('has-scene', !!make); requestAnimationFrame(() => box.classList.add('on')); }, cur ? 250 : 0);
  }
  const start = () => { mount(); apply(); new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'data-theme'] }); };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
  if (reduce) document.documentElement.classList.add('reduce-motion');
})();
