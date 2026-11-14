const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}

function readPngDims(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    assert(buf.toString('ascii', 1, 4) === 'PNG', `Invalid PNG signature: ${filePath}`);
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  } finally {
    fs.closeSync(fd);
  }
}

function verifyManifest() {
  const manifestPath = path.join(ROOT, 'manifest.json');
  assert(fs.existsSync(manifestPath), 'manifest.json missing');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert(manifest.manifest_version === 3, 'manifest_version must be 3');
  assert(manifest.chrome_url_overrides?.newtab === 'newtab.html', 'newtab override missing');

  const newtabPath = path.join(ROOT, manifest.chrome_url_overrides.newtab);
  assert(fs.existsSync(newtabPath), 'newtab.html missing');

  const expectedIcons = { '16': 16, '48': 48, '128': 128 };
  for (const [key, size] of Object.entries(expectedIcons)) {
    const rel = manifest.icons?.[key];
    assert(rel, `icons.${key} missing in manifest.json`);
    const iconPath = path.join(ROOT, rel);
    assert(fs.existsSync(iconPath), `Icon file missing: ${rel}`);
    const dims = readPngDims(iconPath);
    assert(dims.width === size && dims.height === size, `${rel} must be ${size}x${size}, got ${dims.width}x${dims.height}`);
  }
  console.log('✓ manifest.json & icons verified');
}

function verifyHtmlAndBundle() {
  const html = fs.readFileSync(path.join(ROOT, 'newtab.html'), 'utf8');
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'newtab.html must not contain inline <script>');
  assert(!/\son[a-z]+\s*=/i.test(html), 'newtab.html must not contain inline event handlers');
  assert(fs.existsSync(path.join(ROOT, 'newtab.css')), 'newtab.css missing');
  const bundlePath = path.join(ROOT, 'dist', 'newtab.js');
  assert(fs.existsSync(bundlePath), 'dist/newtab.js bundle missing');
  assert(fs.statSync(bundlePath).size > 1000, 'dist/newtab.js appears empty');
  console.log('✓ newtab.html, newtab.css, and dist/newtab.js verified');
}

function verifySprites() {
  const spriteManifestPath = path.join(ROOT, 'sprites', 'manifest.json');
  assert(fs.existsSync(spriteManifestPath), 'sprites/manifest.json missing');
  const data = JSON.parse(fs.readFileSync(spriteManifestPath, 'utf8'));
  assert(Array.isArray(data.base) && data.base.length === 151, `Expected 151 base sprites, got ${data.base?.length}`);
  assert(Array.isArray(data.variants) && data.variants.length === 449, `Expected 449 variant sprites, got ${data.variants?.length}`);

  const allEntries = [...data.base, ...data.variants];
  for (const entry of allEntries) {
    assert(entry.id && entry.w > 0 && entry.h > 0 && entry.rows > 0, `Invalid entry metadata: ${JSON.stringify(entry)}`);
    assert(Array.isArray(entry.durations) && entry.durations.length > 0, `Invalid durations for ${entry.id}`);

    const animPath = path.join(ROOT, 'sprites', entry.id, 'Walk-Anim.png');
    const shadowPath = path.join(ROOT, 'sprites', entry.id, 'Walk-Shadow.png');
    assert(fs.existsSync(animPath), `Missing Walk-Anim.png for ${entry.id}`);
    assert(fs.existsSync(shadowPath), `Missing Walk-Shadow.png for ${entry.id}`);

    const animDims = readPngDims(animPath);
    const shadowDims = readPngDims(shadowPath);
    const minW = entry.w * entry.durations.length;
    const minH = entry.h * entry.rows;

    assert(animDims.width >= minW && animDims.height >= minH, `Walk-Anim.png dims too small for ${entry.id}`);
    assert(shadowDims.width >= minW && shadowDims.height >= minH, `Walk-Shadow.png dims too small for ${entry.id}`);
  }
  console.log(`✓ Verified all ${allEntries.length} sprite entries (${data.base.length} base, ${data.variants.length} variants)`);
}

verifyManifest();
verifyHtmlAndBundle();
verifySprites();
console.log('All verification checks passed!');
