/*
 * Generates branded PLACEHOLDER Steam store capsules for Greed as PNGs, with no
 * external dependencies — pixels are drawn directly and encoded via zlib. These
 * are meant as ready-to-replace placeholders at Steam's exact required sizes so
 * the store page can be filled in immediately; swap in real art before launch.
 *
 *   node scripts/gen-store-assets.mjs
 *
 * Output: steam/assets/*.png  (see steam/store-copy.md for where each one goes)
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---- tiny PNG encoder (RGBA, 8-bit) ----
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
    raw[y * (stride + 1)] = 0;
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

// ---- palette ----
const FELT_TOP = [15, 81, 50]; // #0f5132
const FELT_BOT = [8, 42, 26]; // #082a1a
const IVORY = [244, 236, 216];
const GOLD = [201, 151, 31];
const GOLD_HI = [245, 196, 81];
const PIP = [32, 23, 9];

// ---- canvas helpers ----
function makeCanvas(w, h) {
  return { w, h, px: Buffer.alloc(w * h * 4) };
}
function blend(c, x, y, [r, g, b], a = 1) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const ia = 1 - a;
  c.px[i] = Math.round(c.px[i] * ia + r * a);
  c.px[i + 1] = Math.round(c.px[i + 1] * ia + g * a);
  c.px[i + 2] = Math.round(c.px[i + 2] * ia + b * a);
  c.px[i + 3] = 255;
}
function fillRoundRect(c, x0, y0, w, h, radius, color, a = 1) {
  const x1 = x0 + w,
    y1 = y0 + h;
  for (let y = Math.floor(y0); y < y1; y++) {
    for (let x = Math.floor(x0); x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
      const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) blend(c, x, y, color, a);
    }
  }
}
function fillCircle(c, cx, cy, r, color, a = 1) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) blend(c, x, y, color, a);
}

// Felt gradient + soft corner vignette.
function drawBackground(c) {
  for (let y = 0; y < c.h; y++) {
    const t = y / (c.h - 1);
    const base = [
      FELT_TOP[0] + (FELT_BOT[0] - FELT_TOP[0]) * t,
      FELT_TOP[1] + (FELT_BOT[1] - FELT_TOP[1]) * t,
      FELT_TOP[2] + (FELT_BOT[2] - FELT_TOP[2]) * t,
    ];
    for (let x = 0; x < c.w; x++) {
      const dx = (x / c.w - 0.5) * 2;
      const dy = (y / c.h - 0.5) * 2;
      const v = Math.max(0, 1 - (dx * dx + dy * dy) * 0.35); // vignette
      blend(c, x, y, [
        base[0] * (0.72 + 0.28 * v),
        base[1] * (0.72 + 0.28 * v),
        base[2] * (0.72 + 0.28 * v),
      ]);
    }
  }
}

// A single die showing 5 pips.
function drawDie(c, x0, y0, size) {
  const border = size * 0.05;
  const radius = size * 0.2;
  fillRoundRect(c, x0 + size * 0.05, y0 + size * 0.09, size, size, radius, [0, 0, 0], 0.28); // shadow
  fillRoundRect(c, x0, y0, size, size, radius, GOLD);
  fillRoundRect(
    c,
    x0 + border,
    y0 + border,
    size - 2 * border,
    size - 2 * border,
    radius - border,
    IVORY,
  );
  const pipR = size * 0.062;
  for (const [tx, ty] of [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.5, 0.5],
    [0.28, 0.72],
    [0.72, 0.72],
  ]) {
    fillCircle(c, x0 + tx * size, y0 + ty * size, pipR, PIP);
  }
}

// ---- 5x7 bitmap wordmark: only the glyphs GREED needs ----
const GLYPHS = {
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
};
const WORD = "GREED";
const GLYPH_W = 5,
  GLYPH_H = 7,
  GAP = 1; // cells

// Draw WORD centered on (cx, cy) fitting within maxW × maxH, with a gold drop-shadow.
function drawWordmark(c, cx, cy, maxW, maxH) {
  const cellsW = WORD.length * GLYPH_W + (WORD.length - 1) * GAP;
  const s = Math.max(1, Math.floor(Math.min(maxW / cellsW, maxH / GLYPH_H)));
  const totalW = cellsW * s;
  const totalH = GLYPH_H * s;
  const startX = Math.round(cx - totalW / 2);
  const startY = Math.round(cy - totalH / 2);
  const drawAt = (ox, oy, color) => {
    let penX = startX + ox;
    for (const ch of WORD) {
      const g = GLYPHS[ch];
      for (let gy = 0; gy < GLYPH_H; gy++) {
        for (let gx = 0; gx < GLYPH_W; gx++) {
          if (g[gy][gx] === "1") {
            for (let yy = 0; yy < s; yy++)
              for (let xx = 0; xx < s; xx++)
                blend(c, penX + gx * s + xx, startY + oy + gy * s + yy, color);
          }
        }
      }
      penX += (GLYPH_W + GAP) * s;
    }
  };
  drawAt(Math.max(2, Math.round(s * 0.5)), Math.max(2, Math.round(s * 0.5)), GOLD); // shadow
  drawAt(0, 0, IVORY);
  return { startY, totalH };
}

// A short gold "tagline" of dice-dot marks under the wordmark (font-free flourish).
function drawDotRule(c, cx, y, count, r, gap) {
  const total = count * (2 * r) + (count - 1) * gap;
  let x = cx - total / 2 + r;
  for (let i = 0; i < count; i++) {
    fillCircle(c, x, y, r, i % 2 ? GOLD_HI : GOLD);
    x += 2 * r + gap;
  }
}

// ---- compose one capsule ----
function compose(w, h) {
  const c = makeCanvas(w, h);
  drawBackground(c);
  const wide = w >= h * 1.35;
  if (wide) {
    const dieSize = Math.round(h * 0.62);
    drawDie(c, Math.round(w * 0.07), Math.round((h - dieSize) / 2), dieSize);
    const textCx = Math.round(w * 0.07 + dieSize + (w - (w * 0.07 + dieSize)) / 2);
    const { startY, totalH } = drawWordmark(
      c,
      textCx,
      Math.round(h * 0.47),
      (w - dieSize) * 0.8,
      h * 0.5,
    );
    if (h >= 150)
      drawDotRule(
        c,
        textCx,
        startY + totalH + Math.round(h * 0.09),
        5,
        Math.max(3, h * 0.02),
        Math.max(6, h * 0.03),
      );
  } else {
    const dieSize = Math.round(Math.min(w, h) * 0.44);
    drawDie(c, Math.round((w - dieSize) / 2), Math.round(h * 0.12), dieSize);
    const { startY, totalH } = drawWordmark(
      c,
      Math.round(w / 2),
      Math.round(h * 0.66),
      w * 0.82,
      h * 0.22,
    );
    drawDotRule(
      c,
      Math.round(w / 2),
      startY + totalH + Math.round(h * 0.06),
      5,
      Math.max(3, w * 0.018),
      Math.max(6, w * 0.03),
    );
  }
  return encodePng(w, h, c.px);
}

// Steam's required capsule sizes (plus a large promo). Names match store-copy.md.
const ASSETS = [
  { name: "small_capsule_231x87", w: 231, h: 87 },
  { name: "header_capsule_460x215", w: 460, h: 215 },
  { name: "main_capsule_616x353", w: 616, h: 353 },
  { name: "vertical_capsule_374x448", w: 374, h: 448 },
  { name: "library_capsule_600x900", w: 600, h: 900 },
  { name: "promo_1232x706", w: 1232, h: 706 },
];

const outDir = fileURLToPath(new URL("../steam/assets/", import.meta.url));
mkdirSync(outDir, { recursive: true });
for (const a of ASSETS) {
  const buf = compose(a.w, a.h);
  writeFileSync(new URL(`../steam/assets/${a.name}.png`, import.meta.url), buf);
  console.log(`Wrote steam/assets/${a.name}.png (${a.w}x${a.h})`);
}
console.log("Done. These are placeholders — replace with final art before launch.");
