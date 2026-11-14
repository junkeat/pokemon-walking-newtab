# Pokémon Walking New Tab

A Manifest V3 Chrome Extension that replaces Chrome's New Tab page with a fullscreen **PixiJS** canvas of randomized Pokémon walking diagonally from top-right to bottom-left over a minimalist dark backdrop.

## Features

- **Diagonal Walking Canvas**: Renders crisp pixel-art Pokémon (`2.5x–3.0x` nearest-neighbor scaling) with semi-transparent ground shadows and Y-sorted depth (`zIndex`).
- **25 Active Cap**: Spawns up to `25` Pokémon on screen simultaneously along the top and right edges, despawning once they exit off-screen.
- **Gen 1 + Rare Variants**: Picks randomly across all `151` base Gen 1 Pokémon (`0001`–`0151`) with a `3%` chance of spawning one of `449` variant/shiny forms.
- **Jump on Click**: Click any walking Pokémon to make it hop into the air while its ground shadow shrinks and fades beneath it.
- **Minimal Overlay**: Includes a live clock/date header and a frosted-glass search bar powered by `chrome.search.query` (with a standard Google Search fallback).
- **MV3 CSP Compatible**: Bundles `pixi.js` v8 with `pixi.js/unsafe-eval` so shaders run cleanly under Chrome's strict Manifest V3 Content Security Policy.

## Installation (Load Unpacked in Chrome)

1. Open `chrome://extensions` in Google Chrome.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select this repository folder (`pokemon-walking-ext`).
4. Open a new browser tab to see the extension in action.

## Development & Scripts

Install dependencies first if working from source:

```bash
npm install
```

Available npm scripts in [`package.json`](package.json):

- `npm run prepare-assets` — Runs [`scripts/prepare-assets.js`](scripts/prepare-assets.js) to parse `AnimData.xml`, copy `Walk-Anim.png` and `Walk-Shadow.png` into `sprites/`, generate `sprites/manifest.json`, and build `icons/icon-{16,48,128}.png`.
- `npm run build` — Bundles [`src/newtab.js`](src/newtab.js) into [`dist/newtab.js`](dist/newtab.js) via `esbuild`.
- `npm run verify` — Runs [`scripts/verify.js`](scripts/verify.js) to validate [`manifest.json`](manifest.json), icon PNG dimensions, [`newtab.html`](newtab.html) CSP compliance, the compiled bundle, and all 600 sprite sheets.

## Project Structure

- `manifest.json` — Chrome Manifest V3 configuration overriding `newtab`.
- `newtab.html` / `newtab.css` — New Tab markup and dark minimalist overlay styles.
- `src/newtab.js` — Clock, search handler, PixiJS scene, diagonal walker loop, and jump-on-click physics.
- `dist/newtab.js` — Minified IIFE bundle loaded by `newtab.html`.
- `sprites/` — Extracted walking animations, shadows, and `manifest.json`.
- `icons/` — Extension icons (`16x16`, `48x48`, `128x128`).
- `scripts/` — Asset preparation and verification utilities.

---

## Disclaimer & Credits

This is an **unofficial, non-commercial fan project** created for personal browser customization and educational purposes. It is not affiliated with, endorsed, sponsored, or approved by The Pokémon Company, Nintendo, Creatures Inc., GAME FREAK inc., or Spike Chunsoft.

- **Pokémon** and all related character names, designs, and trademarks are © Nintendo, Creatures Inc., and GAME FREAK inc.
- **Pokémon Mystery Dungeon** sprite assets and animations originate from Chunsoft / Spike Chunsoft and the **PMD SpriteCollab** community contributors (preserved in the original sprite dataset's `credits.txt` metadata).

All trademarks and copyrights belong to their respective owners. No copyright infringement is intended; if you are a rights holder and have concerns regarding any asset included in this repository, please contact the repository maintainer for prompt removal.
