// Build = copy app/ to dist/ and stamp the version (commit sha or timestamp) into sw.js and config.js,
// so every deploy purges the old service-worker cache and shows the "new version" banner.
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

let v = process.env.COMMIT_REF || '';
if (!v) { try { v = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {} }
v = (v ? v.slice(0, 7) + '-' : '') + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const sw = readFileSync('dist/sw.js', 'utf8');
if (!sw.includes('__VERSION__')) throw new Error('sw.js lost its __VERSION__ placeholder');
writeFileSync('dist/sw.js', sw.replace('__VERSION__', v));
const cfg = readFileSync('dist/config.js', 'utf8');
writeFileSync('dist/config.js', cfg.replace(/window\.LG_VERSION = '[^']*';/, `window.LG_VERSION = '${v}';`));
for (const f of ['index.html', 'theme.css', 'theme-radar.css', 'lg-runtime.js', 'lg-app.js', 'lg-visuals.js', 'lg-brain.js', 'lg-pets.js', 'pets/krishna.webp', 'lg-scenes.js', 'theme-glass.css', 'theme-skins.css', 'vendor/3d-force-graph.min.js', 'brain-seed.json', 'lg-store.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'])
  if (!existsSync('dist/' + f)) throw new Error('missing dist/' + f);
console.log('built dist/ version', v);
