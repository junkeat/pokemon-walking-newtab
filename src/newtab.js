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

async function initCanvas() {
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
      pokeContainer.eventMode = 'static';
      pokeContainer.cursor = 'pointer';

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
        speedMultiplier,
        jumpOffsetY: 0,
        jumpVy: 0,
      };

      pokeContainer.on('pointerdown', () => {
        pokemonState.jumpVy = -4.5;
      });

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

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      app.ticker.stop();
    } else {
      app.ticker.start();
    }
  });
}

initClock();
initSearch();
initCanvas().catch((err) => {
  console.error('Failed to initialize Pokemon canvas:', err);
});
