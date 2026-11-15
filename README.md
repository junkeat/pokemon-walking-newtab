# Pokémon Walking New Tab

A Manifest V3 Chrome Extension that replaces Chrome's New Tab page with a fullscreen **PixiJS** canvas of randomized Pokémon walking diagonally from top-right to bottom-left over a pixel-art Pokémon Mystery Dungeon (PMD) night clearing.

## Live Preview

Try it online via GitHub Pages: **[https://junkeat.github.io/pokemon-walking-newtab/newtab.html](https://junkeat.github.io/pokemon-walking-newtab/newtab.html)**

## Features

- **Diagonal Walking Canvas**: Renders crisp pixel-art Pokémon (`2.5x–3.0x` nearest-neighbor scaling) with semi-transparent ground shadows and Y-sorted depth (`zIndex`).
- **25 Active Cap**: Spawns up to `25` Pokémon on screen simultaneously along the top and right edges, despawning once they exit off-screen.
- **Gen 1–3 + Rare Variants**: Picks randomly across all `386` base Gen 1–3 Pokémon (`0001`–`0386`) with a `3%` chance of spawning one of `1,140` variant/shiny forms (`1,526` sprite entries total).
- **Click to Jump, Inspect & Play Cry**: Clicking any walking Pokémon makes it hop while its ground shadow scales beneath it, plays its cry (streamed from PokéAPI's `cries` repository), and opens a top-right PMD Pokédex card showing its PMD mugshot portrait, National Dex `#`, type badges, variant/shiny tag, and Pokédex entry.
- **PMD Weather HUD**: Top-left PMD-styled weather widget with crisp 16×16 pixel weather icons, live temperature (`°C`), and PMD weather flavor text via Open-Meteo, supporting auto-detected location and click-to-search city override.
- **PMD Overworld Ground & UI**: Procedural pixel-art night clearing (dithered moss patches, grass tufts, slate pebbles, and wildflowers), PMD dialogue-framed search bar (`chrome.search.query` with Google Search fallback), and bundled `Bitcount Grid Single` typography.
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
- `npm run verify` — Runs [`scripts/verify.js`](scripts/verify.js) to validate [`manifest.json`](manifest.json), icon PNG dimensions, [`newtab.html`](newtab.html) CSP compliance, fonts, the compiled bundle, and all `1,526` sprite sheets.

## Project Structure

- `manifest.json` — Chrome Manifest V3 configuration overriding `newtab`.
- `newtab.html` / `newtab.css` — New Tab markup and PMD-styled overlay layout.
- `src/newtab.js` — Ground renderer, clock, search handler, weather HUD, Pokédex portrait/cry widget, PixiJS scene, diagonal walker loop, and jump-on-click physics.
- `src/pokedex-gen1.js` — Bundled National Dex `#001`–`#386` metadata, type colors, and variant ID parser.
- `dist/newtab.js` — Minified IIFE bundle loaded by `newtab.html`.
- `fonts/` — Bundled `Bitcount Grid Single` `.woff2` font files.
- `sprites/` — Extracted walking animations, shadows, and `manifest.json`.
- `icons/` — Extension icons (`16x16`, `48x48`, `128x128`).
- `scripts/` — Asset preparation and verification utilities.

---

## Disclaimer & Credits

This is an **unofficial, non-commercial fan project** created for personal browser customization and educational purposes. It is not affiliated with, endorsed, sponsored, or approved by The Pokémon Company, Nintendo, Creatures Inc., GAME FREAK inc., or Spike Chunsoft.

- **Pokémon** and all related character names, designs, and trademarks are © Nintendo, Creatures Inc., and GAME FREAK inc.
- **Pokémon Mystery Dungeon** sprite assets and animations originate from Chunsoft / Spike Chunsoft and the **PMD SpriteCollab** community contributors (preserved in the original sprite dataset's `credits.txt` metadata).

All trademarks and copyrights belong to their respective owners. No copyright infringement is intended; if you are a rights holder and have concerns regarding any asset included in this repository, please contact the repository maintainer for prompt removal.
