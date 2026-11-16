const fs = require('fs');
const path = require('path');
const { readPngDims } = require('./prepare-assets');

const ROOT = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
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
  for (const fontFile of ['BitcountGridSingle-latin.woff2', 'BitcountGridSingle-latin-ext.woff2']) {
    const fontPath = path.join(ROOT, 'fonts', fontFile);
    assert(fs.existsSync(fontPath), `Font file missing: fonts/${fontFile}`);
    assert(fs.statSync(fontPath).size > 0, `Font file empty: fonts/${fontFile}`);
  }
  console.log('✓ newtab.html, newtab.css, fonts, and dist/newtab.js verified');
}

function verifySprites() {
  const spriteManifestPath = path.join(ROOT, 'sprites', 'manifest.json');
  assert(fs.existsSync(spriteManifestPath), 'sprites/manifest.json missing');
  const data = JSON.parse(fs.readFileSync(spriteManifestPath, 'utf8'));
  assert(Array.isArray(data.base) && data.base.length === 386, `Expected 386 base sprites, got ${data.base?.length}`);
  assert(Array.isArray(data.variants) && data.variants.length >= 449, `Expected at least 449 variant sprites, got ${data.variants?.length}`);

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

async function verifyPokedexData() {
  const { POKEMONS, TYPE_COLORS, parsePokemonMeta } = await import('../src/pokedex.js');

  for (let dex = 1; dex <= 386; dex++) {
    const entry = POKEMONS[dex];
    assert(entry && typeof entry.name === 'string' && entry.name.trim().length > 0, `Missing name for Dex #${dex}`);
    assert(typeof entry.flavor === 'string' && entry.flavor.trim().length > 0, `Missing flavor for Dex #${dex}`);
    assert(Array.isArray(entry.types) && entry.types.length > 0, `Missing types for Dex #${dex}`);
    for (const typeName of entry.types) {
      assert(Object.hasOwn(TYPE_COLORS, typeName), `Unknown type "${typeName}" for Dex #${dex}`);
    }
  }

  const baseMeta = parsePokemonMeta('0001');
  assert(baseMeta.dexNum === 1 && baseMeta.dexNumberStr === '#001' && baseMeta.variantTag === null, 'Base meta parse mismatch');

  const formMeta = parsePokemonMeta('0025/0001');
  assert(formMeta.dexNum === 25 && formMeta.dexNumberStr === '#025' && formMeta.variantTag === 'FORM', 'Form meta parse mismatch');

  const shinyMeta = parsePokemonMeta('0151/0000/0001');
  assert(shinyMeta.dexNum === 151 && shinyMeta.dexNumberStr === '#151' && shinyMeta.variantTag === '★ SHINY', 'Shiny meta parse mismatch');

  const shinyFormMeta = parsePokemonMeta('0386/0001/0001');
  assert(shinyFormMeta.dexNum === 386 && shinyFormMeta.dexNumberStr === '#386' && shinyFormMeta.variantTag === '★ SHINY FORM', 'Shiny form meta parse mismatch');

  console.log('✓ Verified all 386 Pokédex entries, types, and parsePokemonMeta variants');
}

async function main() {
  verifyManifest();
  verifyHtmlAndBundle();
  verifySprites();
  await verifyPokedexData();
  console.log('All verification checks passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
