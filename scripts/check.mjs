// Static checks (the "typecheck" of this no-build app):
// - every inline <script> in app/index.html and every app/*.js file parses
// - index.html loads the runtime before the main script, and has no external scripts outside the allow-list
// - element ids used by lg-app.js's mount point exist
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { validateFeed } from './validate-feed.mjs';

let failed = 0;
const fail = (m) => { console.error('✕ ' + m); failed++; };
const ok = (m) => console.log('✓ ' + m);

const html = readFileSync('app/index.html', 'utf8');
const scripts = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)];
let inline = 0;
for (const [, attrs = '', body] of scripts) {
  if (/\bsrc=/.test(attrs)) continue;
  inline++;
  try { new vm.Script(body, { filename: 'index.html<inline ' + inline + '>' }); } catch (e) { fail('index.html inline script ' + inline + ': ' + e.message); }
}
ok(`index.html: ${inline} inline script(s) parse`);

for (const f of readdirSync('app').filter((f) => f.endsWith('.js'))) {
  try { new vm.Script(readFileSync('app/' + f, 'utf8'), { filename: f }); ok(f + ' parses'); } catch (e) { fail(f + ': ' + e.message); }
}

const order = ['config.js', 'lg-store.js', 'lg-runtime.js'].map((s) => html.indexOf(`src="${s}"`));
// the main app script is the largest inline one (small inline scripts in <head>, like the theme setter, are fine)
const inl = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].sort((x, y) => y[1].length - x[1].length)[0];
const main = inl ? inl.index : -1;
if (order.some((i) => i < 0)) fail('index.html must load config.js, lg-store.js and lg-runtime.js');
else if (!(order[0] < order[1] && order[1] < order[2] && (main < 0 || order[2] < main))) fail('runtime scripts must load in order before the main inline script');
else ok('runtime scripts load before the app');

for (const [, src] of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
  if (/^https?:/.test(src) && !/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\//.test(src)) fail('external script not allowed: ' + src);
}
if (!html.includes('class="top"') || !html.includes('class="right"')) fail('top bar (.top .right) is missing: the ⚡ App button mounts there');
if (!html.includes("case 'build_feature'")) fail("Jarvis lost the build_feature action");
JSON.parse(readFileSync('app/manifest.webmanifest', 'utf8')); ok('manifest is valid JSON');
if (!(html.indexOf('rel="manifest"') > 0 && html.indexOf('rel="manifest"') < html.indexOf('</head>'))) fail('<link rel="manifest"> must be inside <head> (Chrome ignores it in <body>, so the app cannot be installed)'); else ok('manifest link is in <head>');
// installability: browsers refuse a manifest sent as octet-stream (we also send nosniff)
{
  const toml = readFileSync('netlify.toml', 'utf8');
  const block = toml.slice(toml.indexOf('for = "/manifest.webmanifest"'));
  if (!toml.includes('for = "/manifest.webmanifest"') || !block.includes('Content-Type = "application/manifest+json"')) fail('netlify.toml must serve manifest.webmanifest as application/manifest+json');
  else ok('manifest content type set for install');
}

{ const fe = validateFeed(JSON.parse(readFileSync('app/feed/latest.json', 'utf8'))); if (fe.length) fail('feed: ' + fe.join('; ')); else ok('daily feed is valid'); }

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
