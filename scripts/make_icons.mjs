// Draws Glint's own four-point spark glyph into PNGs (no dependencies):
//   assets/trayTemplate.png (16px) + trayTemplate@2x.png (32px): black-on-transparent menu-bar template
//   assets/icon.png (512px): dock icon, white spark on a blue-violet rounded square
// Run: node scripts/make_icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(new URL('..', import.meta.url).pathname, 'assets');
mkdirSync(out, { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Spark: sqrt|x| + sqrt|y| <= 1 (a concave four-point star), with a small round core.
const inSpark = (u, v) => Math.sqrt(Math.abs(u)) + Math.sqrt(Math.abs(v)) <= 1 || u * u + v * v < 0.02;
// Coverage by 4x4 supersampling; (cx, cy, r) in pixels.
function coverage(x, y, cx, cy, r, test = inSpark) {
  let hit = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const u = (x + (i + 0.5) / 4 - cx) / r, v = (y + (j + 0.5) / 4 - cy) / r;
    if (test(u, v)) hit++;
  }
  return hit / 16;
}

for (const [name, size] of [['trayTemplate.png', 16], ['trayTemplate@2x.png', 32]]) {
  const c = size / 2, r = size * 0.47;
  writeFileSync(join(out, name), png(size, (x, y) => [0, 0, 0, Math.round(255 * coverage(x, y, c, c, r))]));
}

{
  const S = 512, c = S / 2;
  const inSquircle = (u, v) => Math.abs(u) ** 5 + Math.abs(v) ** 5 <= 1;
  writeFileSync(join(out, 'icon.png'), png(S, (x, y) => {
    const bg = coverage(x, y, c, c, S * 0.41, inSquircle);
    if (bg === 0) return [0, 0, 0, 0];
    const t = (x + y) / (2 * S);
    const base = [Math.round(37 + t * (124 - 37)), Math.round(99 + t * (58 - 99)), Math.round(235 + t * (237 - 235))];
    const s = coverage(x, y, c, c, S * 0.3);
    return [...base.map((ch) => Math.round(ch * (1 - s) + 255 * s)), Math.round(255 * bg)];
  }));
}
console.log('wrote', ['trayTemplate.png', 'trayTemplate@2x.png', 'icon.png'].map((f) => join(out, f)).join('\n'));
