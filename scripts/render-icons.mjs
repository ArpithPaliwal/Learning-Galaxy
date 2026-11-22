// Renders the arc-reactor app icons as PNGs with no dependencies (node:zlib only).
// Usage: node scripts/render-icons.mjs   → app/icons/*.png
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function render(size, { bleed = false } = {}) {
  const px = Buffer.alloc(size * size * 4); const S = 4; // supersample
  const scale = bleed ? 0.72 : 0.9; // maskable icons keep content inside the safe zone
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = ((x + (sx + 0.5) / S) / size) * 2 - 1, v = ((y + (sy + 0.5) / S) / size) * 2 - 1;
      const d = Math.hypot(u, v) / scale, ang = Math.atan2(v, u);
      // background: rounded square (or full bleed) in deep navy with a blue glow
      const inBg = bleed ? 1 : 1 - smooth(0.96, 1.0, Math.max(Math.abs(u), Math.abs(v)) ** 6 + 0.0);
      let cr = mix(2, 10, Math.max(0, 1 - d)), cg = mix(6, 30, Math.max(0, 1 - d)), cb = mix(13, 60, Math.max(0, 1 - d));
      const ring = (rad, w, inten) => { const k = Math.exp(-(((d - rad) / w) ** 2)) * inten; cr += 62 * k; cg += 200 * k; cb += 255 * k; };
      ring(0.86, 0.035, 0.9); // outer ring
      // segmented middle ring
      const seg = (Math.sin(ang * 10) > -0.2 ? 1 : 0.15); ring(0.62, 0.07, 0.85 * seg);
      ring(0.42, 0.03, 0.6);
      // core
      const core = Math.exp(-((d / 0.2) ** 2));
      cr += 230 * core; cg += 250 * core; cb += 255 * core;
      // soft glow
      const glow = Math.exp(-((d / 0.55) ** 2)) * 0.35; cr += 30 * glow; cg += 110 * glow; cb += 160 * glow;
      r += Math.min(255, cr); g += Math.min(255, cg); b += Math.min(255, cb); a += 255 * inBg;
    }
    const n = S * S, i = (y * size + x) * 4;
    px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; px[i + 3] = a / n;
  }
  return png(size, size, px);
}

mkdirSync('app/icons', { recursive: true });
writeFileSync('app/icons/icon-192.png', render(192));
writeFileSync('app/icons/icon-512.png', render(512));
writeFileSync('app/icons/icon-maskable-512.png', render(512, { bleed: true }));
writeFileSync('app/icons/apple-touch-icon.png', render(180, { bleed: true }));
console.log('icons written to app/icons');
