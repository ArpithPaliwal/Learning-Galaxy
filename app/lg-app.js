/* Learning Galaxy — App panel (⚡ App in the top bar).
 * Everything that only exists because this is a standalone app: install, AI key, cloud sync,
 * "Claude builds it" feature requests, cloud jobs, backup import/export, version.
 * Uses the HUD styles already defined in index.html (.card, .btn, .inp, .label, .field …). */
(function () {
  'use strict';
  const LG = window.LG; if (!LG) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m) => { const t = $('#toast'); if (!t) return alert(m); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3600); };

  /* ---------- styles for the bits index.html doesn't have ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .top .right .lg-appbtn{position:relative;width:auto;height:34px;padding:0 12px;gap:7px;display:inline-flex;align-items:center;border-radius:999px;white-space:nowrap;color:var(--accent-2);font:700 12px var(--f-label);letter-spacing:.14em;text-transform:uppercase}
  .lg-dot{width:8px;height:8px;border-radius:50%;background:var(--fg-3);box-shadow:0 0 6px currentColor;flex:none}
  .lg-dot.ok{background:#5ef0a0;color:#5ef0a0}.lg-dot.syncing{background:var(--accent);color:var(--accent);animation:breathe 1s infinite}
  .lg-dot.error{background:var(--crit);color:var(--crit)}.lg-dot.offline,.lg-dot.signed_out{background:#ffb84d;color:#ffb84d}
  .lg-panel{width:min(640px,100%)}
  .lg-tabs{display:flex;gap:4px;flex-wrap:wrap}
  .lg-tabs button{border:1px solid var(--line);background:none;border-radius:2px;padding:6px 10px;color:var(--fg-3);font:700 12px var(--f-label);letter-spacing:.12em;text-transform:uppercase}
  .lg-tabs button.on{color:var(--accent-2);border-color:var(--accent);background:rgba(62,200,255,.08)}
  .lg-sec{display:flex;flex-direction:column;gap:12px}
  .lg-note{font-size:13px;color:var(--fg-2);line-height:1.5}
  .lg-note code{font-family:var(--f-mono);font-size:12px;background:rgba(62,200,255,.08);padding:1px 5px}
  .lg-builds{display:flex;flex-direction:column;gap:6px}
  .lg-build{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--line);background:rgba(2,8,16,.6)}
  .lg-build a{color:var(--fg);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:14px}
  .lg-build a:hover{color:var(--accent-2)}
  .lg-st{font:700 11px var(--f-label);letter-spacing:.12em;text-transform:uppercase;padding:3px 7px;border:1px solid var(--line-2);color:var(--fg-2);white-space:nowrap}
  .lg-st.shipped{color:#5ef0a0;border-color:#5ef0a0}.lg-st.building{color:var(--accent);border-color:var(--accent)}.lg-st.needs{color:var(--crit);border-color:var(--crit)}
  .lg-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:560px){.lg-two{grid-template-columns:1fr}.top .right .lg-appbtn{padding:0 10px}}
  .lg-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:85;display:flex;gap:10px;align-items:center;background:rgba(3,12,22,.97);border:1px solid var(--accent);padding:8px 10px 8px 14px;box-shadow:0 0 24px var(--glow-soft);max-width:calc(100% - 32px);font-size:14px}
  @media (max-width:640px){.lg-banner{bottom:calc(84px + env(safe-area-inset-bottom,0px))}}`;
  document.head.appendChild(css);

  /* ---------- top-bar button ---------- */
  function mountButton() {
    const right = $('.top .right'); if (!right || $('#lgAppBtn')) return;
    const b = document.createElement('button');
    b.id = 'lgAppBtn'; b.className = 'iconbtn lg-appbtn'; b.title = 'App: AI key, sync, builds, backup';
    b.innerHTML = '<i class="lg-dot" id="lgDot"></i><span class="t">⚡ App</span>';
    b.onclick = () => openPanel();
    right.insertBefore(b, right.firstChild);
    paintDot();
  }
  function paintDot() { const d = $('#lgDot'); if (!d) return; const s = LG.Sync.state.status; d.className = 'lg-dot ' + s; d.title = { ok: 'Synced', syncing: 'Syncing…', error: 'Sync error: ' + LG.Sync.state.error, offline: 'Offline — saved on this device', signed_out: 'Sync: not signed in', off: 'Saved on this device (cloud sync off)' }[s] || s; }
  LG.bus.addEventListener('sync', () => { paintDot(); if (panelTab === 'sync') draw(); });

  /* ---------- install prompt ---------- */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (panelTab === 'home') draw(); });
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  /* ---------- panel ---------- */
  let panelTab = null, wrap = null;
  function openPanel(tab) {
    panelTab = tab || panelTab || (LG.aiCfg().key ? 'home' : 'ai');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.innerHTML = '<div class="scrim" data-lgclose></div><div class="modal" data-lgclose><div class="mcard card lg-panel" role="dialog" aria-modal="true" aria-label="App settings"></div></div>';
      wrap.addEventListener('click', (e) => { if (e.target.hasAttribute && e.target.hasAttribute('data-lgclose')) closePanel(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && wrap && wrap.isConnected) closePanel(); });
    }
    document.body.appendChild(wrap); draw();
  }
  function closePanel() { if (wrap) wrap.remove(); panelTab = null; }
  const TABS = [['home', 'Overview'], ['ai', 'AI brain'], ['sync', 'Cloud sync'], ['build', 'Builder'], ['data', 'Data']];

  function draw() {
    if (!wrap || !wrap.isConnected) return;
    const card = $('.lg-panel', wrap);
    const head = `<div class="row" style="justify-content:space-between"><div><div class="label">Learning Galaxy app</div><h3>⚡ App</h3></div><button class="iconbtn" data-lgclose aria-label="Close">✕</button></div>
      <div class="lg-tabs">${TABS.map(([k, l]) => `<button data-t="${k}" class="${k === panelTab ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    card.innerHTML = head + '<div class="lg-sec" id="lgBody"></div>';
    card.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { panelTab = b.dataset.t; draw(); }));
    card.querySelector('[data-lgclose]').onclick = closePanel;
    const body = $('#lgBody', card);
    ({ home, ai, sync, build, data })[panelTab](body);
  }

  function home(el) {
    const ai = LG.aiCfg(), s = LG.Sync.state;
    const row = (ok, t, d, tab) => `<div class="lg-build"><div><b style="font-size:14px">${ok ? '✓' : '○'} ${t}</b><div class="faint" style="font-size:12.5px">${d}</div></div>${tab ? `<button class="btn small" data-go="${tab}">${ok ? 'Change' : 'Set up'}</button>` : ''}</div>`;
    el.innerHTML = `<p class="lg-note">This is your Learning Galaxy as a real app: it works offline, installs to your home screen, and keeps its data on this device. Set up the pieces below once.</p>
      <div class="lg-builds">
        ${row(standalone(), 'Installed as an app', standalone() ? 'Running from your home screen.' : installEvt ? 'Tap Install to add it to this device.' : 'In your browser menu choose “Install app” / “Add to Home screen”.', '')}
        ${row(!!ai.key, 'AI brain', ai.key ? LG.PROVIDERS[ai.provider].label + ' · ' + esc(ai.models.default) : 'Jarvis, courses and quizzes need an AI key.', 'ai')}
        ${row(LG.Sync.signedIn(), 'Cloud sync', LG.Sync.signedIn() ? 'Signed in as ' + esc((LG.Sync.session().user || {}).email || '') + (s.last ? ' · last sync ' + new Date(s.last).toLocaleTimeString() : '') : LG.Sync.configured() ? 'Sign in to sync phone, tablet and PC.' : 'Optional: sync across devices with Supabase.', 'sync')}
        ${row(LG.GH.hasToken(), 'Claude builder', LG.GH.hasToken() ? 'Jarvis can file and track feature builds.' : 'Ask for a feature and Claude builds and ships it.', 'build')}
        ${row(LG.store.count() > 0, 'Your data', LG.store.count() + ' records on this device', 'data')}
      </div>
      <div class="row">${installEvt && !standalone() ? '<button class="btn primary" id="lgInstall">⬇ Install app</button>' : ''}<span class="faint" style="font-size:12px">Version ${esc(LG.version)}</span></div>`;
    el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { panelTab = b.dataset.go; draw(); }));
    const ib = $('#lgInstall', el); if (ib) ib.onclick = async () => { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; draw(); };
  }

  function ai(el) {
    const c = LG.cfg.get('ai', {}) || {}; const cur = LG.aiCfg(); const P = LG.PROVIDERS[cur.provider];
    el.innerHTML = `<p class="lg-note">Jarvis, course drafting, quizzes and teach-back use this key. It is stored only on this device and sent only to the provider you pick.</p>
      <div class="field"><span class="label">Provider</span><select class="inp" id="aiP">${Object.entries(LG.PROVIDERS).map(([k, p]) => `<option value="${k}" ${k === cur.provider ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
      <div class="field"><span class="label">API key</span><input class="inp" id="aiK" type="password" autocomplete="off" placeholder="${esc(P.keyHint)}" value="${esc(c.key || '')}">${P.keyUrl ? `<a class="faint" style="font-size:12.5px" href="${P.keyUrl}" target="_blank" rel="noopener">Get a key ↗</a>` : ''}</div>
      ${cur.provider === 'anthropic' ? '' : `<div class="field"><span class="label">Endpoint URL</span><input class="inp" id="aiB" placeholder="https://…/v1" value="${esc(c.base || P.base)}"></div>`}
      <div class="lg-two"><div class="field"><span class="label">Model (normal)</span><input class="inp" id="aiM" placeholder="${esc(P.models.default || 'model name')}" value="${esc(c.default || '')}"></div>
      <div class="field"><span class="label">Model (deep think)</span><input class="inp" id="aiC" placeholder="${esc(P.models.complex || 'same as normal')}" value="${esc(c.complex || '')}"></div></div>
      <div class="field"><span class="label">Model (quick / eco)</span><input class="inp" id="aiQ" placeholder="${esc(P.models.quick || 'same as normal')}" value="${esc(c.quick || '')}"></div>
      <div class="row"><button class="btn primary" id="aiSave">Save</button><button class="btn" id="aiTest">Test</button><span class="faint" id="aiOut" style="font-size:13px"></span></div>`;
    const read = () => ({ provider: $('#aiP', el).value, key: $('#aiK', el).value.trim(), base: $('#aiB', el) ? $('#aiB', el).value.trim() : '', default: $('#aiM', el).value.trim(), complex: $('#aiC', el).value.trim(), quick: $('#aiQ', el).value.trim() });
    $('#aiP', el).onchange = () => { LG.cfg.set('ai', Object.assign(read(), { base: '' })); draw(); };
    $('#aiSave', el).onclick = () => { LG.cfg.set('ai', read()); toast('AI settings saved.'); draw(); };
    $('#aiTest', el).onclick = async () => {
      LG.cfg.set('ai', read()); const o = $('#aiOut', el); o.textContent = 'Testing…';
      try { const r = await LG.sample('Reply with exactly: Online.', { modelTier: 'quick', maxTokens: 20 }); o.textContent = '✓ ' + r.text.trim().slice(0, 60); }
      catch (e) { o.textContent = '✕ ' + (e.text || e.message); }
    };
  }

  function sync(el) {
    const p = LG.Sync.project(), s = LG.Sync.state, ses = LG.Sync.session();
    const status = { ok: '✓ Synced' + (s.last ? ' at ' + new Date(s.last).toLocaleTimeString() : ''), syncing: 'Syncing…', error: '✕ ' + esc(s.error), offline: 'Offline. Changes are saved here and sync when you are back online.', signed_out: 'Not signed in.', off: 'Off. Data is saved on this device only.' }[s.status] || s.status;
    el.innerHTML = `<p class="lg-note">Your data is always saved on this device first. Cloud sync copies it to your own free <b>Supabase</b> database so your phone, tablet and PC stay in step. Setup steps are in <code>docs/SETUP.md</code> in the repo.</p>
      <div class="lg-build"><span style="font-size:14px">${status}</span>${LG.Sync.signedIn() ? '<button class="btn small" id="sbNow">Sync now</button>' : ''}</div>
      <details ${p.url ? '' : 'open'}><summary class="label" style="cursor:pointer">Supabase project</summary>
        <div class="lg-sec" style="margin-top:10px"><div class="field"><span class="label">Project URL</span><input class="inp" id="sbU" placeholder="https://xxxx.supabase.co" value="${esc(p.url)}"></div>
        <div class="field"><span class="label">Anon (public) key</span><input class="inp" id="sbK" placeholder="eyJ…" value="${esc(p.key)}"></div>
        <button class="btn small" id="sbSave" style="align-self:flex-start">Save project</button></div></details>
      ${LG.Sync.configured() ? (LG.Sync.signedIn()
        ? `<div class="row"><span class="faint" style="font-size:13px">Signed in as <b>${esc((ses.user || {}).email || '')}</b></span><button class="btn small ghost" id="sbOut">Sign out</button></div>`
        : `<div class="field"><span class="label">Your email</span><div class="row"><input class="inp" id="sbE" type="email" style="flex:1 1 200px" value="${esc(LG.cfg.get('sb.email', ''))}"><button class="btn small" id="sbSend">Email me a link</button></div></div>
           <div class="field"><span class="label">Or type a code (if your email has one)</span><div class="row"><input class="inp" id="sbC" inputmode="numeric" style="flex:1 1 120px" placeholder="123456"><button class="btn small primary" id="sbVer">Sign in</button></div>
           <span class="faint" style="font-size:12.5px">Open the link from the email on THIS device (same browser or the installed app). It signs you in and starts syncing.</span></div>`) : ''}`;
    const q = (s) => $(s, el);
    q('#sbSave').onclick = () => { LG.Sync.setProject(q('#sbU').value, q('#sbK').value); toast('Supabase project saved.'); draw(); };
    q('#sbNow') && (q('#sbNow').onclick = () => LG.Sync.run());
    q('#sbOut') && (q('#sbOut').onclick = () => { LG.Sync.signOut(); draw(); });
    q('#sbSend') && (q('#sbSend').onclick = async () => { try { await LG.Sync.sendCode(q('#sbE').value.trim()); toast('Check your email and open the link on this device.'); } catch (e) { toast(e.message); } });
    q('#sbVer') && (q('#sbVer').onclick = async () => { try { await LG.Sync.verify(q('#sbE').value.trim(), q('#sbC').value); toast('Signed in. Syncing…'); draw(); } catch (e) { toast(e.message); } });
  }

  function build(el) {
    el.innerHTML = `<p class="lg-note">Ask for any feature (here or just tell Jarvis). It becomes a GitHub issue; a GitHub Action runs <b>Claude Code</b> on it, checks it, and ships it to this app automatically, usually in 10–20 minutes. Reopen the app to get the new version.</p>
      <div class="field"><span class="label">What should Claude build?</span><input class="inp" id="frT" placeholder="e.g. Flashcard streak calendar on Today"><textarea class="inp" id="frD" rows="3" placeholder="Details: where it goes, how it should look and behave"></textarea></div>
      <div class="row"><select class="inp" id="frM" style="width:auto"><option value="sonnet">Sonnet (fast)</option><option value="opus">Opus (smartest)</option></select><button class="btn primary" id="frGo">🔨 Build it</button></div>
      <div class="label" style="margin-top:4px">Recent builds</div><div class="lg-builds" id="frList"><div class="faint" style="font-size:13px">Loading…</div></div>
      <details ${LG.GH.hasToken() ? '' : 'open'}><summary class="label" style="cursor:pointer">GitHub token ${LG.GH.hasToken() ? '(saved)' : '(optional)'}</summary>
        <div class="lg-sec" style="margin-top:10px"><p class="lg-note">Without a token, “Build it” opens a prefilled GitHub issue for you to submit. With a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a> (repo <code>${esc(LG.GH.repo())}</code> only · Issues: read/write · Actions: read/write) Jarvis can file builds and start cloud jobs by itself.</p>
        <div class="row"><input class="inp" id="ghT" type="password" style="flex:1 1 220px" placeholder="github_pat_…"><button class="btn small" id="ghS">Save</button>${LG.GH.hasToken() ? '<button class="btn small ghost" id="ghX">Remove</button>' : ''}</div></div></details>
      <div class="label">Cloud jobs</div><div class="row"><button class="btn small" id="jobD">Run daily job now</button><button class="btn small" id="jobC">Find course videos now</button></div>`;
    const q = (s) => $(s, el);
    q('#frGo').onclick = async () => {
      const t = q('#frT').value.trim(); if (!t) { toast('Write what to build first.'); return; }
      try { const r = await LG.GH.requestFeature(t, q('#frD').value, { model: q('#frM').value, source: 'App panel' }); toast(r.number ? 'Sent as #' + r.number + '. Claude is on it.' : 'Submit the GitHub issue that just opened.'); q('#frT').value = ''; q('#frD').value = ''; loadBuilds(q('#frList')); } catch (e) { toast(e.message); }
    };
    q('#ghS').onclick = () => { LG.GH.setToken(q('#ghT').value); toast('GitHub token saved on this device.'); draw(); };
    q('#ghX') && (q('#ghX').onclick = () => { LG.GH.setToken(''); draw(); });
    q('#jobD').onclick = async () => { try { toast((await LG.GH.runJob('daily')) ? 'Daily job started. Results sync in a few minutes.' : 'Opened GitHub Actions: press “Run workflow”.'); } catch (e) { toast(e.message); } };
    q('#jobC').onclick = async () => { try { toast((await LG.GH.runJob('courses')) ? 'Course finder started.' : 'Opened GitHub Actions: press “Run workflow”.'); } catch (e) { toast(e.message); } };
    loadBuilds(q('#frList'));
  }
  async function loadBuilds(box) {
    try {
      const list = await LG.GH.builds();
      box.innerHTML = list.length ? list.map((b) => `<div class="lg-build"><a href="${esc(b.url)}" target="_blank" rel="noopener">#${b.number} ${esc(b.title)}</a><span class="lg-st ${b.status.split(' ')[0]}">${esc(b.status)}</span></div>`).join('') : '<div class="faint" style="font-size:13px">No builds yet.</div>';
    } catch (e) { box.innerHTML = `<div class="faint" style="font-size:13px">${esc(e.message)}</div>`; }
  }

  function data(el) {
    const all = LG.store.exportAll(); const counts = Object.entries(all).map(([k, v]) => [k, Object.keys(v).length]).sort((a, b) => b[1] - a[1]);
    el.innerHTML = `<p class="lg-note">${LG.store.count()} records on this device${counts.length ? ': ' + counts.slice(0, 8).map(([k, n]) => esc(k) + ' ' + n).join(' · ') : ''}.</p>
      <div class="row"><label class="btn primary" style="cursor:pointer">⬆ Import a backup<input type="file" id="dImp" accept="application/json,.json" hidden></label><button class="btn" id="dExp">⬇ Download a backup</button></div>
      <p class="lg-note">Import merges a backup file (from this app or the old claude.ai version) into your data. Records with the same id are replaced.</p>`;
    $('#dExp', el).onclick = () => window.claude.use('downloads').then((d) => d.save({ filename: 'learning-galaxy-' + new Date().toISOString().slice(0, 10) + '.json', data: JSON.stringify(LG.store.exportAll()) }));
    $('#dImp', el).onchange = async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { const n = LG.store.importAll(JSON.parse(await f.text())); toast('Imported ' + n + ' records.'); LG.Sync.soon(500); draw(); } catch (er) { toast('That file is not a Learning Galaxy backup.'); }
    };
  }

  LG.openPanel = openPanel;

  /* ---------- first run ---------- */
  LG.store.ready.then(() => {
    mountButton();
    if (!LG.store.count() || !LG.aiCfg().key) setTimeout(() => { if (!document.querySelector('.modal:not([hidden])')) openPanel(LG.store.count() > 1 ? 'ai' : 'home'); }, 900);
  });
  if (document.readyState !== 'loading') mountButton(); else document.addEventListener('DOMContentLoaded', mountButton);

  /* ---------- service worker + update banner ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/localhost:\d+$/.test(location.host) || ('serviceWorker' in navigator && location.search.includes('sw=1'))) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              const b = document.createElement('div'); b.className = 'lg-banner';
              b.innerHTML = '<span>✨ A new version is ready.</span><button class="btn small primary">Reload</button>';
              b.querySelector('button').onclick = () => location.reload();
              document.body.appendChild(b);
            }
          });
        });
      }).catch(() => {});
    });
  }
})();
