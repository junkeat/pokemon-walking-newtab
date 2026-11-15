import 'pixi.js/unsafe-eval';
import {
  Application,
  Assets,
  Container,
  Rectangle,
  Sprite,
  Texture,
  TextureStyle,
} from 'pixi.js';
import { GEN1_POKEMON, TYPE_COLORS, parsePokemonMeta } from './pokedex-gen1.js';

const MAX_POKEMON = 25;
const INITIAL_SPAWN_COUNT = 15;
const VARIANT_CHANCE = 0.03;
const SW_DIRECTION_ROW = 7;

TextureStyle.defaultOptions.scaleMode = 'nearest';

function initClock() {
  const clockEl = document.getElementById('clock');
  const dateEl = document.getElementById('date');

  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    clockEl.setAttribute('datetime', now.toISOString());
    dateEl.textContent = now.toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  updateClock();
  setInterval(updateClock, 1000);
}

function initSearch() {
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');

  form.addEventListener('submit', async (e) => {
    const query = input.value.trim();
    if (!query) {
      e.preventDefault();
      return;
    }

    if (globalThis.chrome?.search?.query) {
      e.preventDefault();
      try {
        await chrome.search.query({
          text: query,
          disposition: 'CURRENT_TAB',
        });
      } catch (err) {
        console.error('chrome.search.query failed, falling back to Google:', err);
        form.submit();
      }
    }
  });
}

function pickRandomPokemon(manifest) {
  if (manifest.variants.length > 0 && Math.random() < VARIANT_CHANCE) {
    const idx = Math.floor(Math.random() * manifest.variants.length);
    return manifest.variants[idx];
  }
  const idx = Math.floor(Math.random() * manifest.base.length);
  return manifest.base[idx];
}

function sliceDirectionFrames(baseTexture, meta) {
  const dirRow = Math.min(SW_DIRECTION_ROW, meta.rows - 1);
  const frames = [];
  for (let i = 0; i < meta.durations.length; i++) {
    const frameRect = new Rectangle(i * meta.w, dirRow * meta.h, meta.w, meta.h);
    frames.push(new Texture({ source: baseTexture.source, frame: frameRect }));
  }
  return frames;
}

async function initCanvas(onSelectPokemon) {
  const containerEl = document.getElementById('canvas-container');
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  containerEl.appendChild(app.canvas);

  const world = new Container();
  world.sortableChildren = true;
  app.stage.addChild(world);

  const response = await fetch('sprites/manifest.json');
  if (!response.ok) {
    throw new Error(`Failed to load sprites/manifest.json: ${response.status}`);
  }
  const manifest = await response.json();
  if (!manifest.base || manifest.base.length === 0) {
    throw new Error('Sprite manifest contains no base Pokemon.');
  }

  const frameCache = new Map();
  const activePokemon = [];
  let pendingSpawns = 0;
  let spawnCooldown = 0;

  async function loadPokemonFrames(meta) {
    if (frameCache.has(meta.id)) {
      return frameCache.get(meta.id);
    }

    const promise = (async () => {
      const animPath = `sprites/${meta.id}/Walk-Anim.png`;
      const shadowPath = `sprites/${meta.id}/Walk-Shadow.png`;
      const [animTex, shadowTex] = await Promise.all([
        Assets.load(animPath),
        Assets.load(shadowPath),
      ]);
      return {
        animFrames: sliceDirectionFrames(animTex, meta),
        shadowFrames: sliceDirectionFrames(shadowTex, meta),
      };
    })();

    frameCache.set(meta.id, promise);
    try {
      return await promise;
    } catch (err) {
      frameCache.delete(meta.id);
      throw err;
    }
  }

  async function spawnPokemon(initialOnScreen = false) {
    if (activePokemon.length + pendingSpawns >= MAX_POKEMON) return;
    pendingSpawns++;

    try {
      const meta = pickRandomPokemon(manifest);
      const { animFrames, shadowFrames } = await loadPokemonFrames(meta);

      // Re-check hard cap after async texture load
      if (activePokemon.length >= MAX_POKEMON) return;

      const scale = 2.5 + Math.random() * 0.5;
      const speedMultiplier = 0.8 + Math.random() * 0.55;
      const baseSpeed = 1.6 * speedMultiplier;
      const vx = -baseSpeed;
      const vy = baseSpeed * 0.75;

      const pad = Math.max(meta.w, meta.h) * scale;
      const W = window.innerWidth;
      const H = window.innerHeight;

      let x;
      let y;
      if (initialOnScreen) {
        x = pad + Math.random() * Math.max(1, W - pad);
        y = Math.random() * Math.max(1, H - pad);
      } else {
        const topSpan = W + pad;
        const rightSpan = H;
        if (Math.random() < topSpan / (topSpan + rightSpan)) {
          x = Math.random() * (W + pad);
          y = -pad;
        } else {
          x = W + pad;
          y = Math.random() * H;
        }
      }

      const startFrame = Math.floor(Math.random() * meta.durations.length);
      const pokeContainer = new Container();

      const shadowSprite = new Sprite(shadowFrames[startFrame]);
      shadowSprite.anchor.set(0.5, 0.5);
      shadowSprite.tint = 0x000000;
      shadowSprite.alpha = 0.35;

      const animSprite = new Sprite(animFrames[startFrame]);
      animSprite.anchor.set(0.5, 0.5);

      pokeContainer.addChild(shadowSprite);
      pokeContainer.addChild(animSprite);
      pokeContainer.scale.set(scale);
      pokeContainer.position.set(x, y);
      pokeContainer.zIndex = y;

      world.addChild(pokeContainer);

      const pokemonState = {
        meta,
        container: pokeContainer,
        animSprite,
        shadowSprite,
        animFrames,
        shadowFrames,
        durations: meta.durations,
        frameIndex: startFrame,
        frameTimer: 0,
        x,
        y,
        vx,
        vy,
        pad,
        scale,
        halfW: meta.w * scale * 0.4,
        halfH: meta.h * scale * 0.4,
        speedMultiplier,
        jumpOffsetY: 0,
        jumpVy: 0,
      };

      activePokemon.push(pokemonState);
    } catch (err) {
      console.error('Failed to spawn Pokemon:', err);
    } finally {
      pendingSpawns--;
    }
  }

  for (let i = 0; i < INITIAL_SPAWN_COUNT; i++) {
    spawnPokemon(true);
  }

  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    const W = window.innerWidth;
    const H = window.innerHeight;

    for (let i = activePokemon.length - 1; i >= 0; i--) {
      const p = activePokemon[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.container.position.set(p.x, p.y);
      p.container.zIndex = p.y;

      if (p.jumpOffsetY < 0 || p.jumpVy < 0) {
        p.jumpOffsetY += p.jumpVy * dt;
        p.jumpVy += 0.32 * dt;
        if (p.jumpOffsetY >= 0) {
          p.jumpOffsetY = 0;
          p.jumpVy = 0;
        }
        p.animSprite.y = p.jumpOffsetY;
        const s = Math.max(0.55, 1 + p.jumpOffsetY / 28);
        p.shadowSprite.scale.set(s);
        p.shadowSprite.alpha = 0.35 * s;
      }

      p.frameTimer += dt * p.speedMultiplier;
      while (p.frameTimer >= p.durations[p.frameIndex]) {
        p.frameTimer -= p.durations[p.frameIndex];
        p.frameIndex = (p.frameIndex + 1) % p.durations.length;
        p.animSprite.texture = p.animFrames[p.frameIndex];
        p.shadowSprite.texture = p.shadowFrames[p.frameIndex];
      }

      if (p.x < -p.pad || p.y > H + p.pad) {
        world.removeChild(p.container);
        p.container.destroy();
        activePokemon.splice(i, 1);
      }
    }

    spawnCooldown -= dt;
    if (activePokemon.length + pendingSpawns < MAX_POKEMON && spawnCooldown <= 0) {
      spawnPokemon(false);
      spawnCooldown = 15 + Math.random() * 25;
    }
  });

  function hitTestPokemon(clientX, clientY) {
    let topmost = null;
    for (let i = 0; i < activePokemon.length; i++) {
      const p = activePokemon[i];
      const py = p.y + p.jumpOffsetY * p.scale;
      if (Math.abs(clientX - p.x) <= p.halfW && Math.abs(clientY - py) <= p.halfH) {
        if (!topmost || p.y > topmost.y) {
          topmost = p;
        }
      }
    }
    return topmost;
  }

  window.addEventListener('pointerdown', (e) => {
    const cityForm = document.getElementById('weather-city-form');
    if (e.target?.closest?.('#weather-widget')) {
      return;
    }
    if (cityForm && !cityForm.hidden) {
      cityForm.hidden = true;
    }
    if (e.target?.closest?.('#search-form, #pokedex-widget')) {
      return;
    }
    const hit = hitTestPokemon(e.clientX, e.clientY);
    if (hit) {
      hit.jumpVy = -4.5;
      onSelectPokemon?.(hit.meta);
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (e.target?.closest?.('#weather-widget, #pokedex-widget, #search-form')) {
      document.body.style.cursor = '';
      return;
    }
    const hit = hitTestPokemon(e.clientX, e.clientY);
    document.body.style.cursor = hit ? 'pointer' : '';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      app.ticker.stop();
    } else {
      app.ticker.start();
    }
  });
}

const WEATHER_CACHE_KEY = 'pmd_weather_cache';
const WEATHER_LOC_KEY = 'pmd_weather_loc';
const CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_LOCATION = { lat: 1.3521, lon: 103.8198, name: 'Singapore' };

const WEATHER_PALETTE = {
  Y: '#fde047',
  O: '#fb923c',
  W: '#f8fafc',
  C: '#cbd5e1',
  S: '#64748b',
  B: '#38bdf8',
  D: '#60a5fa',
  L: '#bae6fd',
};

const WEATHER_ICONS = {
  sun: [
    '.......YY.......',
    '..O....YY....O..',
    '...O........O...',
    '.....OYYYYO.....',
    '....OYYYYYYO....',
    '.O..YYYYYYYY..O.',
    '...OYYYYYYYYO...',
    'OO.YYYYYYYYYY.OO',
    'OO.YYYYYYYYYY.OO',
    '...OYYYYYYYYO...',
    '.O..YYYYYYYY..O.',
    '....OYYYYYYO....',
    '.....OYYYYO.....',
    '...O........O...',
    '..O....YY....O..',
    '.......YY.......',
  ],
  moon: [
    '................',
    '......YYYY......',
    '....YYLLLL......',
    '...YLLLL........',
    '..YLLL......Y...',
    '..YLL......YYY..',
    '.YLLL.......Y...',
    '.YLLL...........',
    '.YLLL...........',
    '.YLLLL....Y.....',
    '..YLLLL...Y.....',
    '..YYLLLLLL......',
    '...YYYLLLLLY....',
    '....YYYYYYY.....',
    '................',
    '................',
  ],
  partlyCloudy: [
    '......YY........',
    '..O...YY...O....',
    '...O.YYYY.O.....',
    '....YYYYYY......',
    '.O.YYYYYYYY.....',
    '...YYYYYWWWW....',
    '....YYYWWWWWW...',
    '....YYWWWWWWWW..',
    '.....WWWWWWWWWW.',
    '...WWWWWWWWWWWW.',
    '..WWWWWWWWWWCCC.',
    '..WWWWWWWWCCCCC.',
    '..WCCCCCCCCCCCC.',
    '...CCCCCCCCCCC..',
    '................',
    '................',
  ],
  cloud: [
    '................',
    '................',
    '................',
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWWWWWWWWWWW..',
    '.WWWWWWWWWWWWWW.',
    '.WWWWWWWWWWCCCC.',
    '.WWWWWWWWCCCCCC.',
    '.WCCCCCCCCCCCCC.',
    '..CCCCCCCCCCCC..',
    '................',
    '................',
    '................',
    '................',
  ],
  fog: [
    '................',
    '.....WWWWWW.....',
    '...WWWWWWWWWW...',
    '..WWWWWWWWWWWW..',
    '..WWCCCCCCCCCC..',
    '...CCCCCCCCCC...',
    '................',
    '..CCCCCCCCCCCC..',
    '................',
    '...WWWWWWWWWW...',
    '................',
    '..CCCCCCCCCCCC..',
    '................',
    '....WWWWWWWW....',
    '................',
    '................',
  ],
  rain: [
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWWWWWWWCCCC..',
    '.WWWWWWWCCCCCCC.',
    '.WCCCCCCCCCCCCC.',
    '..CCCCCCCCCCCC..',
    '................',
    '...B....B....B..',
    '..DB...DB...DB..',
    '..D....D....D...',
    '....B....B......',
    '...DB...DB...B..',
    '...D....D...DB..',
    '............D...',
    '................',
  ],
  snow: [
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWWWWWWWCCCC..',
    '.WWWWWWWCCCCCCC.',
    '.WCCCCCCCCCCCCC.',
    '..CCCCCCCCCCCC..',
    '................',
    '..W...L....W....',
    '...W......W...L.',
    '.....L..W.......',
    '..L......L...W..',
    '....W........L..',
    '..W....L..W.....',
    '................',
    '................',
  ],
  thunder: [
    '......SSSS......',
    '....SSSSSSSS....',
    '...SSSSSSSSSS...',
    '..SSSSSSSSSSSS..',
    '.SSSSSSCCCCCCCC.',
    '.SCCCCCCCCCCCCC.',
    '..CCCCCCCCCCCC..',
    '.......YYY......',
    '......YYY.......',
    '.....YYYYYY.....',
    '.......YYY......',
    '..B...YYY....B..',
    '.DB..YY.....DB..',
    '.D...Y......D...',
    '................',
    '................',
  ],
};

function renderPixelIcon(svgEl, iconKey) {
  const rows = WEATHER_ICONS[iconKey] || WEATHER_ICONS.sun;
  const ns = 'http://www.w3.org/2000/svg';
  svgEl.replaceChildren();
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const color = WEATHER_PALETTE[ch];
      if (!color) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) {
        end++;
      }
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(end - x));
      rect.setAttribute('height', '1');
      rect.setAttribute('fill', color);
      svgEl.appendChild(rect);
      x = end;
    }
  }
}

function mapWeatherCode(code, isDay, tempC) {
  if (code === 0) {
    if (!isDay) return { label: 'Starry Night', icon: 'moon' };
    return tempC >= 30
      ? { label: 'Harsh Sunlight', icon: 'sun' }
      : { label: 'Clear Skies', icon: 'sun' };
  }
  if (code === 1 || code === 2) return { label: 'Light Clouds', icon: 'partlyCloudy' };
  if (code === 3) return { label: 'Overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Dense Fog', icon: 'fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Light Drizzle', icon: 'rain' };
  if ([61, 63, 80, 81].includes(code)) return { label: 'Rain', icon: 'rain' };
  if ([65, 66, 67, 82].includes(code)) return { label: 'Heavy Rain', icon: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Hail / Snow', icon: 'snow' };
  if ([95, 96, 99].includes(code)) return { label: 'Thunderstorm', icon: 'thunder' };
  return { label: isDay ? 'Clear Skies' : 'Starry Night', icon: isDay ? 'sun' : 'moon' };
}

function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/private-mode storage errors
  }
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 3500,
      maximumAge: 600000,
    });
  });
}

async function detectLocation() {
  try {
    const pos = await getBrowserPosition();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    let name = 'Current Location';
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
      );
      if (res.ok) {
        const data = await res.json();
        name = data.city || data.locality || data.principalSubdivision || name;
      }
    } catch {
      // keep fallback label
    }
    return { lat, lon, name };
  } catch {
    try {
      const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
      if (res.ok) {
        const geo = await res.json();
        const lat = Number(geo.latitude);
        const lon = Number(geo.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { lat, lon, name: geo.city || geo.region || geo.country || 'Local Area' };
        }
      }
    } catch {
      // fall through to default
    }
    return DEFAULT_LOCATION;
  }
}

function initWeather() {
  const iconEl = document.getElementById('weather-icon');
  const tempEl = document.getElementById('weather-temp');
  const condEl = document.getElementById('weather-condition');
  const locEl = document.getElementById('weather-location');
  const locBtn = document.getElementById('weather-location-btn');
  const cityForm = document.getElementById('weather-city-form');
  const cityInput = document.getElementById('weather-city-input');
  const gpsBtn = document.getElementById('weather-gps-btn');

  function renderWeather(loc, tempC, code, isDay) {
    const rounded = Math.round(tempC);
    const { label, icon } = mapWeatherCode(code, Boolean(isDay), rounded);
    tempEl.textContent = `${rounded}°C`;
    condEl.textContent = label;
    locEl.textContent = loc.name;
    renderPixelIcon(iconEl, icon);
  }

  async function fetchAndRenderWeather(loc) {
    locEl.textContent = loc.name;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo request failed: ${res.status}`);
    }
    const data = await res.json();
    const current = data.current;
    if (!current || typeof current.temperature_2m !== 'number') {
      throw new Error('Malformed weather response');
    }
    renderWeather(loc, current.temperature_2m, current.weather_code, current.is_day);
    writeJsonStorage(WEATHER_CACHE_KEY, {
      loc,
      temp: current.temperature_2m,
      code: current.weather_code,
      isDay: current.is_day,
      ts: Date.now(),
    });
  }

  async function loadWeather(forceDetect = false) {
    const savedLoc = forceDetect ? null : readJsonStorage(WEATHER_LOC_KEY);
    const cached = forceDetect ? null : readJsonStorage(WEATHER_CACHE_KEY);

    if (cached && cached.loc && typeof cached.temp === 'number') {
      const matchesSaved = !savedLoc || savedLoc.name === cached.loc.name;
      if (matchesSaved) {
        renderWeather(cached.loc, cached.temp, cached.code, cached.isDay);
        if (Date.now() - cached.ts < CACHE_TTL_MS) {
          return;
        }
      }
    }

    try {
      const loc = savedLoc || (await detectLocation());
      writeJsonStorage(WEATHER_LOC_KEY, loc);
      await fetchAndRenderWeather(loc);
    } catch (err) {
      console.error('Weather update failed:', err);
      if (!cached) {
        condEl.textContent = 'Offline';
        locEl.textContent = savedLoc?.name || 'Set city';
        renderPixelIcon(iconEl, 'cloud');
      }
    }
  }

  locBtn.addEventListener('click', () => {
    cityForm.hidden = !cityForm.hidden;
    if (!cityForm.hidden) {
      cityInput.value = '';
      cityInput.focus();
    }
  });

  cityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = cityInput.value.trim();
    if (!query) return;

    condEl.textContent = 'Searching...';
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
      );
      if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
      const data = await res.json();
      const first = data.results?.[0];
      if (!first) {
        condEl.textContent = 'Not found';
        return;
      }
      const loc = {
        lat: first.latitude,
        lon: first.longitude,
        name: first.name,
      };
      writeJsonStorage(WEATHER_LOC_KEY, loc);
      cityForm.hidden = true;
      await fetchAndRenderWeather(loc);
    } catch (err) {
      console.error('City search failed:', err);
      condEl.textContent = 'Lookup failed';
    }
  });

  gpsBtn.addEventListener('click', async () => {
    try {
      localStorage.removeItem(WEATHER_LOC_KEY);
      localStorage.removeItem(WEATHER_CACHE_KEY);
    } catch {
      // ignore
    }
    cityForm.hidden = true;
    condEl.textContent = 'Locating...';
    await loadWeather(true);
  });

  renderPixelIcon(iconEl, 'sun');
  loadWeather();
}

const POKEDEX_FLAVOR_PREFIX = 'pmd_pokedex_flavor_';
const PMD_PORTRAIT_BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait';
const POKE_CRY_LATEST_BASE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
const POKE_CRY_LEGACY_BASE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy';

function initPokedex() {
  const widget = document.getElementById('pokedex-widget');
  const spriteCanvas = document.getElementById('pokedex-sprite');
  const numberEl = document.getElementById('pokedex-number');
  const nameEl = document.getElementById('pokedex-name');
  const variantEl = document.getElementById('pokedex-variant');
  const typesEl = document.getElementById('pokedex-types');
  const flavorEl = document.getElementById('pokedex-flavor');
  const closeBtn = document.getElementById('pokedex-close-btn');
  const ctx = spriteCanvas.getContext('2d');
  const portraitCache = new Map();
  const cryAudio = new Audio();
  cryAudio.volume = 0.10;
  let selectionSeq = 0;

  async function playPokemonCry(dexNum, seq) {
    if (!Number.isFinite(dexNum) || dexNum < 1) return;
    if (cryAudio.src) {
      cryAudio.pause();
      cryAudio.currentTime = 0;
    }
    cryAudio.src = `${POKE_CRY_LATEST_BASE}/${dexNum}.ogg`;
    try {
      await cryAudio.play();
    } catch {
      if (seq !== selectionSeq) return;
      cryAudio.src = `${POKE_CRY_LEGACY_BASE}/${dexNum}.ogg`;
      try {
        await cryAudio.play();
      } catch {
        // Offline or blocked playback
      }
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  function renderPortraitToCanvas(img) {
    const cw = spriteCanvas.width;
    const ch = spriteCanvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, cw, ch);
  }

  function renderFrameToCanvas(img, meta) {
    const cw = spriteCanvas.width;
    const ch = spriteCanvas.height;
    const sy = Math.min(SW_DIRECTION_ROW, meta.rows - 1) * meta.h;
    const scale = Math.min((cw - 4) / meta.w, (ch - 4) / meta.h);
    const dw = Math.max(1, Math.round(meta.w * scale));
    const dh = Math.max(1, Math.round(meta.h * scale));
    const dx = Math.round((cw - dw) / 2);
    const dy = Math.round((ch - dh) / 2);
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, sy, meta.w, meta.h, dx, dy, dw, dh);
  }

  async function drawPokemonPortrait(meta, seq) {
    const cached = portraitCache.get(meta.id);
    if (cached) {
      if (cached.type === 'portrait') {
        renderPortraitToCanvas(cached.img);
      } else {
        renderFrameToCanvas(cached.img, meta);
      }
      return;
    }

    ctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);

    let portraitImg = null;
    try {
      portraitImg = await loadImage(`${PMD_PORTRAIT_BASE}/${meta.id}/Normal.png`);
    } catch {
      if (meta.id.includes('/')) {
        const baseId = meta.id.split('/')[0];
        try {
          portraitImg = await loadImage(`${PMD_PORTRAIT_BASE}/${baseId}/Normal.png`);
        } catch {
          portraitImg = null;
        }
      }
    }

    if (portraitImg) {
      portraitCache.set(meta.id, { type: 'portrait', img: portraitImg });
      if (seq === selectionSeq) {
        renderPortraitToCanvas(portraitImg);
      }
      return;
    }

    try {
      const spriteImg = await loadImage(`sprites/${meta.id}/Walk-Anim.png`);
      portraitCache.set(meta.id, { type: 'sprite', img: spriteImg });
      if (seq === selectionSeq) {
        renderFrameToCanvas(spriteImg, meta);
      }
    } catch {
      // Offline & no sprite available
    }
  }

  async function enrichFlavorFromApi(dexNum, seq) {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${dexNum}`);
      if (!res.ok) return;
      const data = await res.json();
      const entries = Array.isArray(data.flavor_text_entries) ? data.flavor_text_entries : [];
      const enEntry = entries.find((item) => item.language?.name === 'en');
      const cleaned = enEntry?.flavor_text
        ?.replace(/[\f\n\r]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) return;
      writeJsonStorage(`${POKEDEX_FLAVOR_PREFIX}${dexNum}`, { flavor: cleaned, ts: Date.now() });
      if (seq === selectionSeq) {
        flavorEl.textContent = cleaned;
      }
    } catch {
      // Offline or unreachable: keep bundled local Pokédex entry
    }
  }

  function showPokemonInfo(meta) {
    const seq = ++selectionSeq;
    const { dexNum, dexNumberStr, variantTag } = parsePokemonMeta(meta.id);
    const entry = GEN1_POKEMON[dexNum] || {
      name: `Pokémon ${dexNumberStr}`,
      types: [],
      flavor: 'A wandering Pokémon spotted crossing your new tab.',
    };

    numberEl.textContent = dexNumberStr;
    nameEl.textContent = entry.name;

    if (variantTag) {
      variantEl.textContent = variantTag;
      variantEl.hidden = false;
    } else {
      variantEl.hidden = true;
    }

    const typeItems = entry.types.map((typeName) => {
      const li = document.createElement('li');
      li.textContent = typeName;
      li.setAttribute('style', `--type-color: ${TYPE_COLORS[typeName] || '#94a3b8'}`);
      return li;
    });
    typesEl.replaceChildren(...typeItems);

    const cached = readJsonStorage(`${POKEDEX_FLAVOR_PREFIX}${dexNum}`);
    flavorEl.textContent = cached?.flavor || entry.flavor;

    drawPokemonPortrait(meta, seq);
    playPokemonCry(dexNum, seq);
    widget.hidden = false;

    if (!cached?.flavor && dexNum >= 1 && dexNum <= 386) {
      enrichFlavorFromApi(dexNum, seq);
    }
  }

  closeBtn.addEventListener('click', () => {
    widget.hidden = true;
  });

  return { showPokemonInfo };
}

const GROUND_PALETTE = {
  d: '#101b24',
  g: '#1f3d3a',
  m: '#284f49',
  l: '#34635a',
  r: '#0f1722',
  s: '#283546',
  h: '#38495e',
  Y: '#d9a426',
  B: '#3898c8',
  P: '#8b74bd',
};

const GRASS_PROPS = [
  ['..l...', '.gm.l.', 'lgmgm.', 'dgmdg.', '.ddd..'],
  ['.l..l', 'gm.mg', 'dgmgd', '.ddd.'],
  ['.l.m.', 'lmlgm', 'gmmdg', '.ddd.'],
];

const PEBBLE_PROPS = [
  ['.hh..', 'hssr.', 'rsrr.'],
  ['.h....', 'hsr.h.', 'rr.hsr', '...rrr'],
];

const FLOWER_TEMPLATES = [
  ['..F..', '.F.F.', '..F..', '.mgl.', '.ddd.'],
  ['.FF.', 'F.F.', '.mg.', '.dd.'],
];

const FLOWER_COLORS = ['Y', 'B', 'P'];

function cellHash(cx, cy, salt = 0) {
  let h = (cx * 374761393 + cy * 668265263 + salt * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawGroundSprite(ctx, rows, ox, oy, flowerChar = null) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      let ch = row[x];
      if (ch === '.') continue;
      if (ch === 'F' && flowerChar) ch = flowerChar;
      const color = GROUND_PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function initGround() {
  const canvas = document.getElementById('ground-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const PIXEL_SCALE = 3;

  function render() {
    const cw = Math.max(1, Math.ceil(window.innerWidth / PIXEL_SCALE));
    const ch = Math.max(1, Math.ceil(window.innerHeight / PIXEL_SCALE));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    // Dark PMD night-clearing base radial gradient
    const grad = ctx.createRadialGradient(
      cw * 0.5,
      ch * 0.45,
      Math.min(cw, ch) * 0.08,
      cw * 0.5,
      ch * 0.48,
      Math.hypot(cw, ch) * 0.58
    );
    grad.addColorStop(0, '#152230');
    grad.addColorStop(1, '#0b1119');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    // Subtle pixel-dithered moss patches across the ground
    const mossCell = 36;
    const mossCols = Math.ceil(cw / mossCell);
    const mossRows = Math.ceil(ch / mossCell);
    for (let cy = 0; cy < mossRows; cy++) {
      for (let cx = 0; cx < mossCols; cx++) {
        const r1 = cellHash(cx, cy, 11);
        if (r1 > 0.42) continue;
        const r2 = cellHash(cx, cy, 12);
        const r3 = cellHash(cx, cy, 13);
        const mx = Math.floor(cx * mossCell + 6 + r2 * (mossCell - 12));
        const my = Math.floor(cy * mossCell + 6 + r3 * (mossCell - 12));
        const rx = 6 + Math.floor(cellHash(cx, cy, 14) * 7);
        const ry = 4 + Math.floor(cellHash(cx, cy, 15) * 4);
        const useLighter = cellHash(cx, cy, 16) > 0.5;
        ctx.fillStyle = useLighter ? '#172636' : '#121e2b';
        for (let dy = -ry; dy <= ry; dy++) {
          for (let dx = -rx; dx <= rx; dx++) {
            const norm = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
            if (norm <= 1 && (norm <= 0.55 || ((mx + dx + my + dy) & 1) === 0)) {
              ctx.fillRect(mx + dx, my + dy, 1, 1);
            }
          }
        }
      }
    }

    // Jittered deterministic grid for grass tufts, pebbles, and tiny flowers
    const cellSize = 20;
    const cols = Math.ceil(cw / cellSize);
    const rows = Math.ceil(ch / cellSize);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (cellHash(cx, cy, 1) > 0.65) continue;
        const ox = Math.floor(cx * cellSize + 2 + cellHash(cx, cy, 2) * (cellSize - 9));
        const oy = Math.floor(cy * cellSize + 2 + cellHash(cx, cy, 3) * (cellSize - 8));
        const kind = cellHash(cx, cy, 4);

        if (kind < 0.12) {
          const tpl = FLOWER_TEMPLATES[Math.floor(cellHash(cx, cy, 5) * FLOWER_TEMPLATES.length)];
          const flowerChar = FLOWER_COLORS[Math.floor(cellHash(cx, cy, 6) * FLOWER_COLORS.length)];
          drawGroundSprite(ctx, tpl, ox, oy, flowerChar);
        } else if (kind < 0.37) {
          const prop = PEBBLE_PROPS[Math.floor(cellHash(cx, cy, 5) * PEBBLE_PROPS.length)];
          drawGroundSprite(ctx, prop, ox, oy);
        } else {
          const prop = GRASS_PROPS[Math.floor(cellHash(cx, cy, 5) * GRASS_PROPS.length)];
          drawGroundSprite(ctx, prop, ox, oy);
        }
      }
    }
  }

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      render();
    });
  });

  render();
}

initGround();
initClock();
initSearch();
initWeather();
const pokedex = initPokedex();
initCanvas(pokedex.showPokemonInfo).catch((err) => {
  console.error('Failed to initialize Pokemon canvas:', err);
});
