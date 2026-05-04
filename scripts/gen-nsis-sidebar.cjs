/**
 * NSIS welcome/finish sidebar: 164×314 24-bit BMP (required size).
 * Composites build/icon.png on a purple Encryptic-style gradient when possible.
 */
const fs = require("fs");
const path = require("path");

const W = 164;
const H = 314;
const outDir = path.join(__dirname, "..", "build");
const outFile = path.join(outDir, "nsis-welcome-164x314.bmp");
const logoPath = path.join(outDir, "icon.png");

/**
 * @param {Buffer} rgb Top-down RGB, width*height*3 bytes
 * @param {number} w
 * @param {number} h
 */
function writeBmp24BottomUp(rgb, w, h, destPath) {
  const rowStride = Math.floor((w * 3 + 3) / 4) * 4;
  const pixelBytes = rowStride * h;
  const fileSize = 14 + 40 + pixelBytes;
  const buf = Buffer.alloc(fileSize, 0);

  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt16LE(0, 6);
  buf.writeUInt16LE(0, 8);
  buf.writeUInt32LE(54, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelBytes, 34);
  buf.writeUInt32LE(0, 38);
  buf.writeUInt32LE(0, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  for (let y = 0; y < h; y++) {
    const rowOff = 54 + y * rowStride;
    const srcY = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const src = (srcY * w + x) * 3;
      const o = rowOff + x * 3;
      buf[o] = rgb[src + 2];
      buf[o + 1] = rgb[src + 1];
      buf[o + 2] = rgb[src];
    }
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}

function writePlainGradientBmp() {
  const rowStride = Math.floor((W * 3 + 3) / 4) * 4;
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const t = y / Math.max(H - 1, 1);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r0 = 18 + t * 55;
      const g0 = 12 + t * 38;
      const b0 = 40 + t * 75;
      const vx = Math.abs(x - (W - 1) / 2) / ((W - 1) / 2 || 1);
      const edge = 1 - vx * 0.2;
      rgb[i] = Math.min(255, Math.floor(r0 * edge));
      rgb[i + 1] = Math.min(255, Math.floor(g0 * edge));
      rgb[i + 2] = Math.min(255, Math.floor(b0 * edge));
    }
  }
  writeBmp24BottomUp(rgb, W, H, outFile);
}

async function writeBrandedSidebar() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    return false;
  }
  if (!fs.existsSync(logoPath)) return false;

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2d1b4e"/>
          <stop offset="45%" stop-color="#15101f"/>
          <stop offset="100%" stop-color="#05050c"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
    </svg>`
  );

  const logoBuf = await sharp(logoPath)
    .resize(112, 112, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(logoBuf).metadata();
  const lw = meta.width || 112;
  const lh = meta.height || 112;
  const left = Math.floor((W - lw) / 2);
  const top = 36;

  const flattened = await sharp(svg)
    .composite([{ input: logoBuf, left, top }])
    .flatten({ background: { r: 5, g: 5, b: 12 } })
    .png()
    .toBuffer();

  const { data, info } = await sharp(flattened)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== W || info.height !== H) {
    throw new Error(`Unexpected raw size ${info.width}x${info.height}`);
  }

  let rgb = data;
  if (info.channels === 4) {
    rgb = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      rgb[i * 3] = data[i * 4];
      rgb[i * 3 + 1] = data[i * 4 + 1];
      rgb[i * 3 + 2] = data[i * 4 + 2];
    }
  } else if (info.channels !== 3) {
    throw new Error(`Unexpected channels ${info.channels}`);
  }

  writeBmp24BottomUp(rgb, W, H, outFile);
  return true;
}

async function main() {
  try {
    const ok = await writeBrandedSidebar();
    if (!ok) {
      writePlainGradientBmp();
      console.log(
        "gen-nsis-sidebar:",
        outFile,
        fs.existsSync(logoPath)
          ? "(plain gradient; install sharp or fix icon.png)"
          : "(plain gradient; add build/icon.png)"
      );
    } else {
      console.log("gen-nsis-sidebar:", outFile, "(logo + Encryptic gradient)");
    }
  } catch (e) {
    console.error(e);
    writePlainGradientBmp();
    console.log("gen-nsis-sidebar:", outFile, "(fallback after error)");
  }
}

void main();
