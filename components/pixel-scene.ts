import { BUCKET_MS, dangersAt, enemyPhase, ERAS, H, itemsFor, W } from "@/lib/game";
import type { GameView, PlayerView } from "./game-canvas";

export type AttackEffect = { fromX: number; fromY: number; x: number; y: number; started: number };

const sprites = typeof window === "undefined" ? null : new Image();
if (sprites) sprites.src = "/pixel-sprites.png";
const terrainTiles = typeof window === "undefined" ? null : new Image();
if (terrainTiles) terrainTiles.src = "/world-tiles.png";
const terrainCache = new Map<number, HTMLCanvasElement>();

const GROUND = ["#0a4667", "#0b6283", "#315a39", "#4b583a", "#554638"];

function tile(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}

function sprite(ctx: CanvasRenderingContext2D, stage: number, row: number, x: number, y: number, width: number, height = width) {
  if (!sprites?.complete || !sprites.naturalWidth) return;
  ctx.drawImage(sprites, stage * 24, row * 24, 24, 24,
    Math.round(x - width / 2), Math.round(y - height / 2), Math.round(width), Math.round(height));
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = "#f4f5cb") {
  ctx.font = '17px "Cellule Pixel", monospace';
  ctx.textAlign = "center";
  const width = ctx.measureText(value).width;
  ctx.fillStyle = "#122d39";
  ctx.fillRect(Math.round(x - width / 2 - 5), Math.round(y - 16), Math.round(width + 10), 19);
  ctx.fillStyle = color;
  ctx.fillText(value, Math.round(x), Math.round(y));
}

function avatar(ctx: CanvasRenderingContext2D, p: PlayerView, row: number, self: boolean, time: number) {
  const x = Math.round(p.x), y = Math.round(p.y + Math.sin(time / 430 + p.x) * 2);
  const size = [45, 53, 54, 57, 60][p.stage];
  if (self) {
    const half = Math.round(size / 2) + 4;
    ctx.fillStyle = p.protectedUntil > time ? "#ffdf85" : "#dbf4be";
    for (const dirX of [-1, 1]) for (const dirY of [-1, 1]) {
      ctx.fillRect(x + dirX * half - (dirX > 0 ? 6 : 0), y + dirY * half - (dirY > 0 ? 3 : 0), 6, 3);
      ctx.fillRect(x + dirX * half - (dirX > 0 ? 3 : 0), y + dirY * half - (dirY > 0 ? 6 : 0), 3, 6);
    }
  }
  sprite(ctx, p.stage, row, x, y, size);
  label(ctx, p.name, x, self ? y + size / 2 + 25 : y - size / 2 - 8);
  if (p.shield > 0) tile(ctx, x + size / 2 - 2, y - size / 2 - 2, 7, "#fbe69c");
}

function background(ctx: CanvasRenderingContext2D, stage: number, time: number) {
  let terrain = terrainCache.get(stage);
  if (!terrain && terrainTiles?.complete && terrainTiles.naturalWidth) {
    terrain = document.createElement("canvas");
    terrain.width = W; terrain.height = H;
    const pen = terrain.getContext("2d");
    if (pen) {
      pen.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y += 48) for (let x = 0; x < W; x += 48) {
        const col = x / 48, row = y / 48;
        const variant = (col * 7 + row * 11 + col * row * 3) % 4;
        pen.drawImage(terrainTiles, variant * 24, stage * 24, 24, 24, x, y, 48, 48);
        if ((col * 17 + row * 23 + col * row * 7) % 9 === 0)
          pen.drawImage(terrainTiles, (4 + (col + row * 3) % 4) * 24, stage * 24, 24, 24, x, y, 48, 48);
      }
      if (stage === 1) {
        // A stepped shore makes the riverbank marker part of the landscape.
        pen.fillStyle = "#958969";
        for (let y = 0; y < H; y += 16) pen.fillRect(866 + (Math.floor(y / 16) % 4) * 8, y, W - 866, 16);
        pen.fillStyle = "#c2b688";
        for (let y = 0; y < H; y += 32) pen.fillRect(895 + (y % 64 ? 8 : 0), y, 65, 4);
      } else if (stage === 2) {
        pen.fillStyle = "#75694a";
        for (let n = 0; n < 5; n++) pen.fillRect(94 + n * 21, 469 - n * 4, 25, 5);
        pen.fillStyle = "#ad9361"; pen.fillRect(98, 455, 68, 4);
      } else if (stage === 3) {
        pen.fillStyle = "#795b3b";
        for (let n = 0; n < 8; n++) {
          const x = 712 + (n % 4) * 18, y = 105 + Math.floor(n / 4) * 51;
          pen.fillRect(x, y, 17, 6);
        }
        pen.fillStyle = "#c9b385"; pen.fillRect(725, 100, 36, 3);
      } else if (stage === 4) {
        pen.fillStyle = "#393430";
        for (const [x, y] of [[459, 276], [476, 265], [518, 265], [540, 276], [459, 340], [480, 352], [520, 352], [540, 340]])
          pen.fillRect(x, y, 20, 11);
        pen.fillStyle = "#a78c66"; pen.fillRect(467, 309, 65, 6);
      }
    }
    terrainCache.set(stage, terrain);
  }
  if (terrain) ctx.drawImage(terrain, 0, 0);
  else { ctx.fillStyle = GROUND[stage]; ctx.fillRect(0, 0, W, H); }
  if (stage < 2) for (let i = 0; i < 22; i++) {
    const x = (i * 173 + 31) % W, y = (i * 97 + 53) % H + Math.round(Math.sin(time / 1100 + i) * 3);
    tile(ctx, x, y, 3, stage === 0 ? "#5ba5a6" : "#91cec5");
  }
  ctx.fillStyle = stage === 4 ? "#b38a5c" : stage < 2 ? "#72abb0" : "#9cad69";
  ctx.fillRect(0, 0, W, 4); ctx.fillRect(0, H - 4, W, 4);
  ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);
}

function marker(ctx: CanvasRenderingContext2D, stage: number, time: number) {
  const m = ERAS[stage].marker;
  if (!m) return;
  const shine = Math.floor(time / 350) % 2 === 0;
  ctx.fillStyle = shine ? "#fbe6a2" : "#acdc9e";
  for (let n = 0; n < 4; n++) {
    const x = m.x + [0, 46, 0, -46][n], y = m.y + [-46, 0, 46, 0][n];
    ctx.fillRect(x - 5, y - 5, 10, 10);
  }
  ctx.fillStyle = "#382e39"; ctx.fillRect(m.x - 19, m.y - 17, 38, 34);
  ctx.fillStyle = "#f0cf82"; ctx.fillRect(m.x - 15, m.y - 13, 30, 26);
  if (stage === 3) { // An egg marks the transition from primate to human.
    ctx.fillStyle = "#fff3cd";
    ctx.fillRect(m.x - 8, m.y - 10, 16, 19);
    ctx.fillRect(m.x - 11, m.y - 4, 22, 11);
    ctx.fillStyle = "#c3b783"; ctx.fillRect(m.x - 3, m.y - 2, 4, 4);
  } else if (stage === 4) { // Rock and wood for the human's fire.
    ctx.fillStyle = "#624839"; ctx.fillRect(m.x - 10, m.y - 2, 20, 6);
    ctx.fillStyle = "#958677"; ctx.fillRect(m.x - 12, m.y + 5, 8, 7); ctx.fillRect(m.x + 5, m.y + 5, 8, 7);
    ctx.fillStyle = "#e76c37"; ctx.fillRect(m.x - 3, m.y - 11, 6, 9);
  } else if (stage === 2) {
    ctx.fillStyle = "#493b30"; ctx.fillRect(m.x - 10, m.y - 5, 20, 15);
    ctx.fillStyle = "#c7a36b"; ctx.fillRect(m.x - 13, m.y - 11, 26, 7);
    ctx.fillStyle = "#1f4334"; ctx.fillRect(m.x - 3, m.y, 6, 10);
  } else { ctx.fillStyle = "#264f61"; ctx.fillRect(m.x - 9, m.y - 7, 18, 14); }
  label(ctx, m.label, m.x, m.y - 63);
}

function item(ctx: CanvasRenderingContext2D, kind: "dna" | "wood" | "stone", x: number, y: number) {
  x = Math.round(x); y = Math.round(y);
  if (kind === "dna") {
    tile(ctx, x - 7, y - 7, 14, "#174d4d");
    tile(ctx, x - 5, y - 5, 10, "#6cdd82");
    tile(ctx, x - 3, y - 5, 4, "#f2ffb1");
  } else if (kind === "wood") {
    tile(ctx, x - 11, y - 3, 22, "#493c33");
    tile(ctx, x - 9, y - 2, 18, "#d39d65");
    tile(ctx, x + 6, y - 3, 3, "#fff2c0");
  } else {
    tile(ctx, x - 7, y - 5, 14, "#263d46");
    tile(ctx, x - 5, y - 7, 10, "#bbc9c5");
    tile(ctx, x - 5, y - 5, 5, "#eff4e4");
  }
}

function attack(ctx: CanvasRenderingContext2D, fx: AttackEffect | null, now: number) {
  if (!fx) return;
  const elapsed = now - fx.started;
  if (elapsed < 0 || elapsed > 340) return;
  const frame = Math.floor(elapsed / 65);
  ctx.fillStyle = frame % 2 ? "#ff663b" : "#fff3ba";
  for (let n = 1; n <= 3; n++) {
    const t = (n + 1) / 5;
    ctx.fillRect(Math.round(fx.fromX + (fx.x - fx.fromX) * t) - 3, Math.round(fx.fromY + (fx.y - fx.fromY) * t) - 3, 7, 7);
  }
  const radius = 14 + frame * 3;
  ctx.fillRect(fx.x - radius, fx.y - 3, radius * 2, 6);
  ctx.fillRect(fx.x - 3, fx.y - radius, 6, radius * 2);
  ctx.fillStyle = frame % 2 ? "#fff4b7" : "#e34832";
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    ctx.fillRect(fx.x + dx * (radius - 2), fx.y + dy * (radius - 2), 6, 6);
}

export function drawScene(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: GameView,
  pos: { x: number; y: number }, time: number, collected: Set<number>,
  camera: { x: number; stage: number }, remote: Map<string, { x: number; y: number; stage: number }>,
  dt: number, fx: AttackEffect | null, frameTime: number) {
  const me = state.players.find((p) => p.id === state.meId);
  if (!me) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  // Render at console resolution, then enlarge each pixel without interpolation.
  const pixelSize = 3;
  const resolutionX = Math.max(1, Math.round(width / pixelSize));
  const resolutionY = Math.max(1, Math.round(height / pixelSize));
  if (canvas.width !== resolutionX || canvas.height !== resolutionY) {
    canvas.width = resolutionX; canvas.height = resolutionY;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(width / W, height / H);
  const viewW = width / scale;
  const targetX = viewW >= W ? W / 2 : Math.max(viewW / 2, Math.min(W - viewW / 2, pos.x));
  if (camera.stage !== me.stage) camera.x = targetX;
  else camera.x += (targetX - camera.x) * Math.min(1, dt * 5);
  camera.stage = me.stage;
  const factorX = canvas.width / width, factorY = canvas.height / height;
  ctx.setTransform(factorX * scale, 0, 0, factorY * scale,
    factorX * (width / 2 - camera.x * scale), factorY * (height / 2 - H / 2 * scale));

  background(ctx, me.stage, time);
  marker(ctx, me.stage, time);
  const bucket = Math.floor(time / BUCKET_MS);
  const taken = bucket === state.bucket ? new Set(state.taken) : new Set<number>();
  for (const pickup of itemsFor(state.code, me.stage, bucket))
    if (!taken.has(pickup.index) && !collected.has(pickup.index))
      item(ctx, pickup.kind, pickup.x, pickup.y + Math.round(Math.sin(time / 380 + pickup.index) * 2));

  for (const trap of state.traps) {
    ctx.fillStyle = "#1b2830"; ctx.fillRect(trap.x - 12, trap.y - 12, 24, 24);
    ctx.fillStyle = trap.ownerId === me.id ? "#d9e791" : "#ee7580";
    ctx.fillRect(trap.x - 9, trap.y - 9, 18, 18);
    ctx.fillStyle = "#1b2830"; ctx.fillRect(trap.x - 3, trap.y - 3, 6, 6);
  }
  for (const danger of dangersAt(me.stage, time)) {
    const enemy = state.enemies.find((e) => e.index === danger.index);
    if (enemy && enemy.hp <= 0 && enemy.respawnUntil > time) continue;
    const pulse = enemyPhase(time, danger.index) >= 1500;
    ctx.fillStyle = pulse ? "#ed587b" : "#883c50";
    ctx.fillRect(Math.round(danger.x - 6), Math.round(danger.y + danger.r + 5), 12, 5);
    sprite(ctx, me.stage, 8, danger.x, danger.y, me.stage === 4 ? danger.r * 3 : danger.r * 2.5, danger.r * 2.5);
    const hp = enemy?.hp ?? 16 + me.stage * 6;
    ctx.fillStyle = "#341c28"; ctx.fillRect(danger.x - 41, danger.y - danger.r - 30, 82, 10);
    ctx.fillStyle = "#f06b63"; ctx.fillRect(danger.x - 39, danger.y - danger.r - 28, Math.round(78 * hp / (enemy?.maxHp ?? hp)), 6);
    label(ctx, ["PHAGE", "REQUIN", "FAUVE", "GÉANT", "DINO"][me.stage], danger.x, danger.y - danger.r - 36);
  }
  for (const [index, p] of state.players.entries()) if (p.stage === me.stage && p.id !== me.id) {
    const point = remote.get(p.id);
    avatar(ctx, { ...p, x: point?.stage === p.stage ? point.x : p.x,
      y: point?.stage === p.stage ? point.y : p.y }, index % 8, false, time);
  }
  avatar(ctx, { ...me, x: pos.x, y: pos.y }, Math.max(0, state.players.findIndex((p) => p.id === me.id)) % 8, true, time);
  attack(ctx, fx, frameTime);
}
