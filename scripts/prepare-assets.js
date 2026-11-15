const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SOURCE_DIR = 'c:\\Users\\limju\\OneDrive\\Desktop\\pokemon sprites';
const WORKSPACE_DIR = path.resolve(__dirname, '..');
const SPRITES_OUT_DIR = path.join(WORKSPACE_DIR, 'sprites');
const ICONS_OUT_DIR = path.join(WORKSPACE_DIR, 'icons');

function readPngDims(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(24);
    fs.readSync(fd, header, 0, 24, 0);
    // PNG signature check
    if (header.toString('ascii', 1, 4) !== 'PNG') {
      throw new Error(`Invalid PNG header: ${filePath}`);
    }
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    };
  } finally {
    fs.closeSync(fd);
  }
}

function parseWalkAnimData(xmlText) {
  const animRegex = /<Anim>([\s\S]*?)<\/Anim>/g;
  let match;
  while ((match = animRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const nameMatch = block.match(/<Name>\s*([^<]+?)\s*<\/Name>/);
    if (!nameMatch || nameMatch[1] !== 'Walk') continue;
    if (/<CopyOf>/.test(block)) return null;

    const wMatch = block.match(/<FrameWidth>\s*(\d+)\s*<\/FrameWidth>/);
    const hMatch = block.match(/<FrameHeight>\s*(\d+)\s*<\/FrameHeight>/);
    if (!wMatch || !hMatch) return null;

    const durations = [];
    const durRegex = /<Duration>\s*(\d+)\s*<\/Duration>/g;
    let dMatch;
    while ((dMatch = durRegex.exec(block)) !== null) {
      durations.push(Number(dMatch[1]));
    }
    if (durations.length === 0) return null;

    return {
      w: Number(wMatch[1]),
      h: Number(hMatch[1]),
      durations,
    };
  }
  return null;
}

// CRC32 table for pure-Node PNG encoding
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type 0
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createPokeballIconPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const cornerR = size * 0.22;
  const pad = size <= 16 ? 0.5 : size * 0.04;
  const ballR = size * 0.36;
  const centerR = size * 0.125;
  const innerDotR = size * 0.065;
  const bandHalf = Math.max(1, size * 0.055);
  const outlineHalf = Math.max(1, size * 0.055);

  const setPixel = (x, y, r, g, b, a = 255) => {
    const idx = (y * size + x) * 4;
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = a;
  };

  const halfBox = size / 2 - pad - cornerR;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Signed distance to rounded rect background
      const dx = Math.max(Math.abs(x - cx) - halfBox, 0);
      const dy = Math.max(Math.abs(y - cy) - halfBox, 0);
      const rectDist = Math.hypot(dx, dy) - cornerR;

      if (rectDist > 0.5) {
        setPixel(x, y, 0, 0, 0, 0);
        continue;
      }

      // Base dark slate background (#0d1117 -> #161f2c subtle vertical gradient)
      const t = y / (size - 1);
      let r = Math.round(22 - 9 * t);
      let g = Math.round(31 - 14 * t);
      let b = Math.round(44 - 21 * t);

      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= ballR) {
        if (dist <= innerDotR) {
          // White center button
          r = 240; g = 246; b = 252;
        } else if (dist <= centerR) {
          // Dark ring around center button
          r = 13; g = 17; b = 23;
        } else if (Math.abs(y - cy) <= bandHalf || dist >= ballR - outlineHalf) {
          // Center horizontal band and outer outline
          r = 13; g = 17; b = 23;
        } else if (y < cy) {
          // Top red half
          r = 239; g = 68; b = 68;
        } else {
          // Bottom white half
          r = 240; g = 246; b = 252;
        }
      }

      setPixel(x, y, r, g, b, 255);
    }
  }

  return encodeRgbaPng(size, size, rgba);
}

function generateIcons() {
  fs.mkdirSync(ICONS_OUT_DIR, { recursive: true });
  for (const size of [16, 48, 128]) {
    const outPath = path.join(ICONS_OUT_DIR, `icon-${size}.png`);
    fs.writeFileSync(outPath, createPokeballIconPng(size));
    console.log(`Generated ${outPath} (${size}x${size})`);
  }
}

function scanAndCopySprites() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Source directory not found: ${SOURCE_DIR}`);
  }

  fs.mkdirSync(SPRITES_OUT_DIR, { recursive: true });
  const manifestPath = path.join(SPRITES_OUT_DIR, 'manifest.json');
  const baseMap = new Map();
  const variantMap = new Map();

  if (fs.existsSync(manifestPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const hasFiles = (id) =>
      fs.existsSync(path.join(SPRITES_OUT_DIR, id, 'Walk-Anim.png')) &&
      fs.existsSync(path.join(SPRITES_OUT_DIR, id, 'Walk-Shadow.png'));

    for (const entry of existing.base || []) {
      if (entry?.id && hasFiles(entry.id)) baseMap.set(entry.id, entry);
    }
    for (const entry of existing.variants || []) {
      if (entry?.id && hasFiles(entry.id)) variantMap.set(entry.id, entry);
    }
  }

  let skipped = 0;

  function walkDir(currentDir, relParts) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const hasAnimData = entries.some((e) => e.isFile() && e.name === 'AnimData.xml');
    const hasWalkAnim = entries.some((e) => e.isFile() && e.name === 'Walk-Anim.png');
    const hasWalkShadow = entries.some((e) => e.isFile() && e.name === 'Walk-Shadow.png');

    if (relParts.length > 0) {
      if (hasAnimData && hasWalkAnim && hasWalkShadow) {
        const xmlText = fs.readFileSync(path.join(currentDir, 'AnimData.xml'), 'utf8');
        const walkMeta = parseWalkAnimData(xmlText);
        if (walkMeta) {
          const walkAnimSrc = path.join(currentDir, 'Walk-Anim.png');
          const walkShadowSrc = path.join(currentDir, 'Walk-Shadow.png');
          const animDims = readPngDims(walkAnimSrc);
          const rows = Math.floor(animDims.height / walkMeta.h);
          const cols = Math.floor(animDims.width / walkMeta.w);

          if (rows > 0 && cols >= walkMeta.durations.length) {
            const relId = relParts.join('/');
            const destSubDir = path.join(SPRITES_OUT_DIR, ...relParts);
            fs.mkdirSync(destSubDir, { recursive: true });
            fs.copyFileSync(walkAnimSrc, path.join(destSubDir, 'Walk-Anim.png'));
            fs.copyFileSync(walkShadowSrc, path.join(destSubDir, 'Walk-Shadow.png'));

            const entry = {
              id: relId,
              w: walkMeta.w,
              h: walkMeta.h,
              durations: walkMeta.durations,
              rows,
            };

            if (relParts.length === 1) {
              baseMap.set(relId, entry);
            } else {
              variantMap.set(relId, entry);
            }
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } else if (hasAnimData || hasWalkAnim || hasWalkShadow) {
        skipped++;
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        walkDir(path.join(currentDir, entry.name), [...relParts, entry.name]);
      }
    }
  }

  walkDir(SOURCE_DIR, []);

  const base = Array.from(baseMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  const variants = Array.from(variantMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(manifestPath, JSON.stringify({ base, variants }, null, 2));
  console.log(
    `Prepared sprites: ${base.length} base, ${variants.length} variants, ${skipped} skipped -> ${manifestPath}`
  );
}

generateIcons();
scanAndCopySprites();
