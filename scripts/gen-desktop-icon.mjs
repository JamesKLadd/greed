/*
 * Generates a 1024x1024 Greed app icon (a die on the felt) as a PNG, with no
 * external dependencies — we draw pixels directly and encode PNG via zlib. Run
 * `npx tauri icon <the png>` afterwards to produce every platform icon format.
 *
 *   node scripts/gen-desktop-icon.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SIZE = 1024;

// --- tiny PNG encoder (RGBA, 8-bit) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- draw the icon ---
const px = Buffer.alloc(SIZE * SIZE * 4);
function set(x, y, [r, g, b]) {
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = 255;
}

const FELT = [10, 61, 38]; // #0a3d26
const IVORY = [244, 236, 216]; // #f4ecd8
const GOLD = [201, 151, 31]; // #c9971f
const PIP = [32, 23, 9]; // #201709

// Die geometry.
const die = { x0: 288, y0: 288, size: 448, radius: 92, border: 22 };
const inRoundRect = (x, y, o) => {
  const { x0, y0, size, radius } = o;
  const x1 = x0 + size,
    y1 = y0 + size;
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};
// Pip centers (quincunx) and radius.
const p = (t) => die.x0 + t * die.size;
const pips = [
  [p(0.28), p(0.28)],
  [p(0.72), p(0.28)],
  [p(0.5), p(0.5)],
  [p(0.28), p(0.72)],
  [p(0.72), p(0.72)],
];
const PIP_R = 42;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let color = FELT;
    if (inRoundRect(x, y, die)) {
      const inner = {
        x0: die.x0 + die.border,
        y0: die.y0 + die.border,
        size: die.size - 2 * die.border,
        radius: die.radius - die.border,
      };
      color = inRoundRect(x, y, inner) ? IVORY : GOLD;
      for (const [px_, py_] of pips) {
        if ((x - px_) ** 2 + (y - py_) ** 2 <= PIP_R ** 2) {
          color = PIP;
          break;
        }
      }
    }
    set(x, y, color);
  }
}

const out = fileURLToPath(new URL("../packages/client/src-tauri/icon-source.png", import.meta.url));
writeFileSync(out, encodePng(SIZE, SIZE, px));
console.log(`Wrote ${out}`);
