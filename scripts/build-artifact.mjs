// Builds the claude.ai artifact edition: ONE html file (all CSS/JS inlined) + feed/latest.json.
//   node scripts/build-artifact.mjs      →  dist-artifact/page.html, dist-artifact/feed/latest.json
// Publish page.html with the Artifact tool (capabilities: db, sample{images}, downloads, dictation, tts) and
// pass feed/latest.json as a supporting file. The page is authored without doctype/html/head/body: the
// platform wraps it. Inside claude.ai the runtime detects the real window.claude and uses the artifact
// database + the viewer's Claude account (see ARTIFACT in app/lg-runtime.js).
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';

const rd = (p) => readFileSync('app/' + p, 'utf8').replace(/\r\n/g, '\n');
const src = rd('index.html');

const ends = src.indexOf('</style>') + '</style>'.length;       // the platform's own reset <style> (dropped)
const headEnd = src.indexOf('</head><body>');
if (ends < 20 || headEnd < 0) throw new Error('unexpected index.html layout (head)');
const extras = src.slice(ends, headEnd);
let body = src.slice(headEnd + '</head><body>'.length, src.lastIndexOf('</body>'));

const guard = (name, code) => { if (/<\/script/i.test(code)) throw new Error(name + ' contains </script'); return code; };
const inlineJs = (name) => `<script>\n${guard(name, rd(name))}\n</script>`;

// 1. head extras: keep the title and the theme bootstrap; inline runtime scripts; drop manifest, icons, app-only metas
const title = (extras.match(/<title>[\s\S]*?<\/title>/) || ['<title>Learning Galaxy</title>'])[0];
const themeScript = (extras.match(/<script>\(function\(\)\{var t=null[\s\S]*?<\/script>/) || [''])[0];
const date = new Date().toISOString().slice(0, 10);
const cfg = rd('config.js').replace(/window\.LG_VERSION = '[^']*';/, `window.LG_VERSION = 'artifact-${date}';`);
const runtime = [`<script>\n${guard('config.js', cfg)}\n</script>`, inlineJs('lg-store.js'), inlineJs('lg-runtime.js')].join('\n');

// 2. body: inline stylesheets, remove the Netlify badge placeholders and the late scripts (re-added at the end, like `defer`)
body = body.replace(/<!-- Netlify injects[\s\S]*?-->\s*<div id="nl-hud-frame"[^>]*><\/div><div id="nl-badge-frame"[^>]*><\/div>/, '');
body = body.replace(/<link rel="stylesheet" href="(theme|theme-radar)\.css">/g, (_, n) => `<style>\n${rd(n + '.css')}\n</style>`);
if (/href="theme(-radar)?\.css"/.test(body)) throw new Error('a stylesheet was not inlined');

const page = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  themeScript,
  runtime,
  body.trim(),
  inlineJs('lg-app.js'),
  inlineJs('lg-visuals.js'),
  '',
].join('\n');

rmSync('dist-artifact', { recursive: true, force: true });
mkdirSync('dist-artifact/feed', { recursive: true });
writeFileSync('dist-artifact/page.html', page);
cpSync('app/feed/latest.json', 'dist-artifact/feed/latest.json');
console.log(`built dist-artifact/page.html (${(page.length / 1024).toFixed(0)} KB)`);
