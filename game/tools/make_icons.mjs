// Draws the app icons (basketball on the arcade's dark tile) as PNGs, without extra packages.
//   node game/tools/make_icons.mjs   → game/icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icons");
fs.mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, px) { // px: Float32Array rgba 0..1
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size * 4; x++) raw[y * (size * 4 + 1) + 1 + x] = Math.round(Math.max(0, Math.min(1, px[y * size * 4 + x])) * 255);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/** Colour of the icon at (u, v) in 0..1. full: background fills the square (maskable / apple). */
function shade(u, v, full) {
  const BG = hex("#0f1628"), BG2 = hex("#1d2a4a"), BALL = hex("#ff7a1a"), BALL2 = hex("#ffa24d"), LINE = hex("#3b1d06");
  // rounded-square tile (or full bleed)
  const r = 0.22, inside = full || (() => {
    const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
    return dx * dx + dy * dy <= r * r;
  })();
  if (!inside) return [0, 0, 0, 0];
  const t = (u + v) / 2;
  let col = BG.map((c, i) => c + (BG2[i] - c) * t);
  // ball
  const cx = 0.5, cy = 0.5, R = full ? 0.3 : 0.36;
  const dx = u - cx, dy = v - cy, d = Math.hypot(dx, dy);
  if (d <= R) {
    const light = Math.max(0, 1 - Math.hypot(dx + R * 0.35, dy + R * 0.35) / (R * 1.6));
    col = BALL.map((c, i) => c + (BALL2[i] - c) * light);
    const w = R * 0.07;
    const nx = dx / R, ny = dy / R;
    const seams = [
      Math.abs(dy) * 1, Math.abs(dx) * 1, // cross
      Math.abs(Math.hypot(nx + 1.25, ny) - 0.95) * R, // left curve
      Math.abs(Math.hypot(nx - 1.25, ny) - 0.95) * R, // right curve
    ];
    if (seams.some((s) => s < w) || d > R - w * 1.1) col = LINE;
  }
  return [...col, 1];
}

function render(size, full) {
  const px = new Float32Array(size * size * 4), S = 4; // 4×4 supersampling
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const acc = [0, 0, 0, 0];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const c = shade((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size, full);
      acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; acc[3] += c[3];
    }
    const a = acc[3] / (S * S), o = (y * size + x) * 4;
    px[o] = acc[3] ? acc[0] / acc[3] : 0; px[o + 1] = acc[3] ? acc[1] / acc[3] : 0; px[o + 2] = acc[3] ? acc[2] / acc[3] : 0; px[o + 3] = a;
  }
  return png(size, px);
}

for (const [name, size, full] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["maskable-512.png", 512, true], ["apple-touch-icon.png", 180, true]]) {
  fs.writeFileSync(path.join(OUT, name), render(size, full));
  console.log("wrote", name);
}
