import { env } from "cloudflare:workers";
import { BUCKET_MS, canEvolve, dangersAt, enemyMaxHp, enemyPhase, ERAS, GAME_MS, H, itemsFor, MUTATIONS, pickupRadius, scoreFor, speedFor, W } from "@/lib/game";

type Room = { code: string; host_token: string; status: string; started_at: number | null; ends_at: number | null; winner_token: string | null };
type Player = {
  token: string; public_id: string; room_code: string; name: string; color: string;
  stage: number; dna: number; wood: number; stone: number; challenge: number;
  x: number; y: number; mutations: string; shield: number; stunned_until: number;
  last_hit: number; last_tick: number; evolved_at: number; joined_at: number;
  last_attack: number; last_trap: number; last_gift: number; slowed_until: number;
  immune_until: number; protected_until: number; boss_score: number; era_boss_score: number;
};
type EnemyRow = { enemy: number; hp: number; respawn_until: number };
type TrapRow = { id: string; owner_token: string; x: number; y: number; expires_at: number };

const COLORS = ["#a9f3d0", "#ffbe8f", "#cdb8ff", "#f2dd83", "#8ddcf6", "#fa99b7", "#b9df93", "#ffc8e9"];
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function db() {
  if (!env.DB) throw new Error("La partie est momentanément indisponible.");
  return env.DB;
}
function bad(message: string, status = 400) { return Response.json({ error: message }, { status }); }
function limit(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function dist(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }
function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join("");
}
function normalizeName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 18);
}

async function getRoom(code: string) {
  return db().prepare("SELECT * FROM rooms WHERE code = ?").bind(code).first<Room>();
}
async function getPlayer(code: string, token: string) {
  return db().prepare("SELECT * FROM players WHERE room_code = ? AND token = ?").bind(code, token).first<Player>();
}

async function endOnTime(room: Room, now: number) {
  if (room.status !== "playing" || !room.ends_at || room.ends_at > now) return room;
  const rows = (await db().prepare("SELECT * FROM players WHERE room_code = ?").bind(room.code).all<Player>()).results;
  rows.sort((a, b) => scoreFor(b) - scoreFor(a) || a.evolved_at - b.evolved_at || a.joined_at - b.joined_at);
  await db().prepare("UPDATE rooms SET status = 'done', winner_token = ? WHERE code = ? AND status = 'playing'")
    .bind(rows[0]?.token ?? null, room.code).run();
  return (await getRoom(room.code)) ?? room;
}

async function snapshot(code: string, token: string) {
  const now = Date.now();
  let room = await getRoom(code);
  if (!room) return bad("Salon introuvable.", 404);
  const me = await getPlayer(code, token);
  if (!me) return bad("Ta place dans ce salon est introuvable. Rejoins-le avec un pseudo.", 403);
  room = await endOnTime(room, now);
  const bucket = Math.floor(now / BUCKET_MS);
  const queries = [db().prepare("SELECT * FROM players WHERE room_code = ? ORDER BY joined_at ASC").bind(code)];
  if (room.status === "playing") queries.push(
    db().prepare("SELECT item FROM claims WHERE room_code = ? AND stage = ? AND bucket = ?").bind(code, me.stage, bucket),
    db().prepare("SELECT enemy,hp,respawn_until FROM enemies WHERE room_code=? AND stage=?").bind(code, me.stage),
    db().prepare("SELECT id,owner_token,x,y,expires_at FROM traps WHERE room_code=? AND stage=? AND expires_at>?").bind(code, me.stage, now),
  );
  const results = await db().batch(queries);
  const players = results[0].results as Player[];
  const taken = room.status === "playing" ? (results[1].results as { item: number }[]).map((r) => r.item) : [];
  const enemyRows = room.status === "playing" ? results[2].results as EnemyRow[] : [];
  const traps = room.status === "playing" ? results[3].results as TrapRow[] : [];
  return Response.json({
    now, bucket, taken,
    enemies: dangersAt(me.stage, now).map((d) => {
      const row = enemyRows.find((r) => r.enemy === d.index);
      return { index: d.index, hp: !row || (row.hp === 0 && row.respawn_until <= now) ? enemyMaxHp(me.stage) : row.hp,
        maxHp: enemyMaxHp(me.stage), respawnUntil: row?.respawn_until ?? 0 };
    }),
    traps: traps.map((t) => ({ id: t.id, x: t.x, y: t.y, ownerId: players.find((p) => p.token === t.owner_token)?.public_id ?? "" })),
    code, meId: me.public_id, isHost: room.host_token === token,
    status: room.status, endsAt: room.ends_at, winnerId: players.find((p) => p.token === room?.winner_token)?.public_id ?? null,
    players: players.map((p) => ({
      id: p.public_id, name: p.name, color: p.color, stage: p.stage, dna: p.dna, wood: p.wood,
      stone: p.stone, challenge: p.challenge, x: p.x, y: p.y, mutations: p.mutations,
      shield: p.shield, stunnedUntil: p.stunned_until, slowedUntil: p.slowed_until,
      protectedUntil: p.protected_until, lastAttack: p.last_attack, lastTrap: p.last_trap,
      lastGift: p.last_gift, bossScore: p.boss_score, score: scoreFor(p),
    })),
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    const token = url.searchParams.get("token") ?? "";
    if (!/^[A-Z2-9]{6}$/.test(code) || !token) return bad("Salon ou session invalide.");
    return snapshot(code, token);
  } catch (error) {
    console.error("game GET", error);
    return bad("Impossible de charger la partie. Réessaie.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const now = Date.now();

    if (action === "create") {
      const name = normalizeName(body.name);
      if (!name) return bad("Choisis un pseudo.");
      let code = "";
      for (let i = 0; i < 5; i++) {
        const candidate = makeCode();
        const result = await db().prepare("INSERT OR IGNORE INTO rooms (code,host_token,status,created_at) VALUES (?,?,?,?)")
          .bind(candidate, "pending", "lobby", now).run();
        if (result.meta.changes) { code = candidate; break; }
      }
      if (!code) return bad("Impossible de créer le salon. Réessaie.", 503);
      const token = crypto.randomUUID();
      const id = crypto.randomUUID().slice(0, 8);
      await db().batch([
        db().prepare("UPDATE rooms SET host_token = ? WHERE code = ?").bind(token, code),
        db().prepare("INSERT INTO players (token,public_id,room_code,name,color,joined_at,evolved_at) VALUES (?,?,?,?,?,?,?)")
          .bind(token, id, code, name, COLORS[0], now, now),
      ]);
      return Response.json({ code, token, state: await (await snapshot(code, token)).json() });
    }

    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-Z2-9]{6}$/.test(code)) return bad("Le code du salon contient 6 caractères.");
    const room = await getRoom(code);
    if (!room || now - (await db().prepare("SELECT created_at FROM rooms WHERE code = ?").bind(code).first<{ created_at: number }>())!.created_at > 86400000) return bad("Salon introuvable ou expiré.", 404);

    if (action === "join") {
      const name = normalizeName(body.name);
      if (!name) return bad("Choisis un pseudo.");
      if (room.status !== "lobby") return bad("La partie a déjà commencé.");
      const existing = (await db().prepare("SELECT name FROM players WHERE room_code = ?").bind(code).all<{ name: string }>()).results;
      if (existing.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return bad("Ce pseudo est déjà pris dans le salon.");
      const token = crypto.randomUUID();
      const id = crypto.randomUUID().slice(0, 8);
      const result = await db().prepare(`INSERT INTO players (token,public_id,room_code,name,color,joined_at,evolved_at)
        SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM players WHERE room_code = ?) < 8`)
        .bind(token, id, code, name, COLORS[existing.length % COLORS.length], now, now, code).run();
      if (!result.meta.changes) return bad("Le salon est complet (8 joueurs).");
      return Response.json({ code, token, state: await (await snapshot(code, token)).json() });
    }

    const token = typeof body.token === "string" ? body.token : "";
    const player = await getPlayer(code, token);
    if (!player) return bad("Session expirée. Rejoins le salon.", 403);

    if (action === "start") {
      if (room.host_token !== token) return bad("Seul l'hôte peut lancer la partie.", 403);
      if (room.status !== "lobby") return bad("La partie est déjà lancée.");
      const members = (await db().prepare("SELECT token FROM players WHERE room_code = ? ORDER BY joined_at").bind(code).all<{ token: string }>()).results;
      if (members.length < 2) return bad("Il faut au moins 2 joueurs pour commencer.");
      await db().prepare("UPDATE rooms SET status = 'playing', started_at = ?, ends_at = ?, winner_token = NULL WHERE code = ? AND status = 'lobby'")
        .bind(now, now + GAME_MS, code).run();
      await db().batch(members.map((m, i) => db().prepare("UPDATE players SET x = ?, y = ?, last_tick = ? WHERE token = ?")
        .bind(120 + (i % 4) * 35, 248 + Math.floor(i / 4) * 52, now, m.token)));
      return snapshot(code, token);
    }

    if (action === "rematch") {
      if (room.host_token !== token) return bad("Seul l'hôte peut relancer une partie.", 403);
      if (room.status !== "done") return bad("La partie n'est pas terminée.");
      await db().batch([
        db().prepare("UPDATE rooms SET status = 'lobby', started_at = NULL, ends_at = NULL, winner_token = NULL WHERE code = ?").bind(code),
        db().prepare(`UPDATE players SET stage=0,dna=0,wood=0,stone=0,challenge=0,mutations='',shield=0,
          stunned_until=0,last_hit=0,last_tick=0,last_attack=0,last_trap=0,last_gift=0,
          slowed_until=0,immune_until=0,protected_until=0,boss_score=0,era_boss_score=0,
          evolved_at=?,x=90,y=300 WHERE room_code = ?`).bind(now, code),
        db().prepare("DELETE FROM enemies WHERE room_code=?").bind(code),
        db().prepare("DELETE FROM enemy_hits WHERE room_code=?").bind(code),
        db().prepare("DELETE FROM traps WHERE room_code=?").bind(code),
        db().prepare("DELETE FROM claims WHERE room_code=?").bind(code),
      ]);
      return snapshot(code, token);
    }

    if (room.status !== "playing" || (room.ends_at && now >= room.ends_at)) return snapshot(code, token);

    if (action === "evolve") {
      if (!canEvolve(player)) return bad("Il reste un objectif à accomplir avant d'évoluer.");
      const mutation = String(body.mutation ?? "");
      if (!MUTATIONS[player.stage].some((m) => m.id === mutation)) return bad("Mutation inconnue.");
      const mutations = [player.mutations, mutation].filter(Boolean).join(",");
      const shield = mutations.split(",").filter((m) => m === "shield").length;
      await db().prepare(`UPDATE players SET stage=stage+1,dna=0,wood=0,stone=0,challenge=0,
        x=105,y=300,mutations=?,shield=?,stunned_until=0,slowed_until=0,immune_until=0,
        protected_until=0,era_boss_score=0,last_hit=0,last_tick=?,evolved_at=? WHERE token=? AND stage=?`)
        .bind(mutations, shield, now, now, token, player.stage).run();
      return snapshot(code, token);
    }

    if (["attack", "trap", "gift"].includes(action)) {
      const x = Number(body.x), y = Number(body.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const seconds = limit((now - player.last_tick) / 1000, 0, 3);
        const maximum = speedFor(player.mutations) * (player.slowed_until > now ? 0.55 : 1) * seconds + 22;
        const wanted = { x: limit(x, 24, W - 24), y: limit(y, 24, H - 24) };
        const factor = Math.min(1, maximum / Math.max(1, dist(player, wanted)));
        if (player.stunned_until <= now) {
          player.x += (wanted.x - player.x) * factor;
          player.y += (wanted.y - player.y) * factor;
        }
        await db().prepare("UPDATE players SET x=?,y=?,last_tick=? WHERE token=? AND stage=?")
          .bind(player.x, player.y, now, token, player.stage).run();
      }
    }

    if (action === "attack") {
      const combat = player.mutations.split(",").filter((m) => m === "combat").length;
      const cooldown = combat >= 2 ? 1200 : 1700;
      if (now - player.last_attack < cooldown) return snapshot(code, token);
      const targetType = String(body.targetType ?? "");
      const targetId = String(body.targetId ?? "");
      if (targetType === "enemy") {
        const index = Number(targetId);
        const enemy = dangersAt(player.stage, now).find((d) => d.index === index);
        // The enemy continues moving while the attack request is in flight.
        if (!enemy || dist(player, enemy) > enemy.r + 100) return snapshot(code, token);
        const attacked = await db().prepare("UPDATE players SET last_attack=? WHERE token=? AND last_attack<=?")
          .bind(now, token, now - cooldown).run();
        if (!attacked.meta.changes) return snapshot(code, token);
        await db().prepare("INSERT OR IGNORE INTO enemies (room_code,stage,enemy,hp) VALUES (?,?,?,?)")
          .bind(code, player.stage, index, enemyMaxHp(player.stage)).run();
        const revived = await db().prepare("UPDATE enemies SET hp=?,respawn_until=0 WHERE room_code=? AND stage=? AND enemy=? AND hp=0 AND respawn_until>0 AND respawn_until<=?")
          .bind(enemyMaxHp(player.stage), code, player.stage, index, now).run();
        if (revived.meta.changes) await db().prepare("DELETE FROM enemy_hits WHERE room_code=? AND stage=? AND enemy=?").bind(code, player.stage, index).run();
        const hit = await db().prepare("UPDATE enemies SET hp=MAX(0,hp-?) WHERE room_code=? AND stage=? AND enemy=? AND hp>0 AND respawn_until=0")
          .bind(1 + combat + (combat >= 2 ? 1 : 0), code, player.stage, index).run();
        if (!hit.meta.changes) return snapshot(code, token);
        await db().prepare(`INSERT INTO enemy_hits (room_code,stage,enemy,token,hit_at) VALUES (?,?,?,?,?)
          ON CONFLICT(room_code,stage,enemy,token) DO UPDATE SET hit_at=excluded.hit_at`)
          .bind(code, player.stage, index, token, now).run();
        const killed = await db().prepare("UPDATE enemies SET respawn_until=? WHERE room_code=? AND stage=? AND enemy=? AND hp=0 AND respawn_until=0")
          .bind(now + 30000, code, player.stage, index).run();
        if (killed.meta.changes) {
          const helpers = (await db().prepare("SELECT token FROM enemy_hits WHERE room_code=? AND stage=? AND enemy=? AND hit_at>=?")
            .bind(code, player.stage, index, now - 15000).all<{ token: string }>()).results;
          for (const helper of helpers) {
            if (player.stage === 4) await db().prepare(`UPDATE players SET wood=MIN(3,wood+1),stone=MIN(2,stone+1),
              protected_until=?,boss_score=boss_score+MIN(10,MAX(0,30-era_boss_score)),era_boss_score=MIN(30,era_boss_score+10)
              WHERE token=? AND stage=?`).bind(now + 10000, helper.token, player.stage).run();
            else if (player.stage === 3) await db().prepare(`UPDATE players SET dna=MIN(18,dna+2),stone=MIN(2,stone+1),
              protected_until=?,boss_score=boss_score+MIN(10,MAX(0,30-era_boss_score)),era_boss_score=MIN(30,era_boss_score+10)
              WHERE token=? AND stage=?`).bind(now + 10000, helper.token, player.stage).run();
            else await db().prepare(`UPDATE players SET dna=MIN(?,dna+2),protected_until=?,
              boss_score=boss_score+MIN(10,MAX(0,30-era_boss_score)),era_boss_score=MIN(30,era_boss_score+10)
              WHERE token=? AND stage=?`).bind(ERAS[player.stage].target, now + 10000, helper.token, player.stage).run();
          }
        }
      } else if (targetType === "player") {
        const rival = await db().prepare("SELECT * FROM players WHERE room_code=? AND public_id=? AND token!=?")
          .bind(code, targetId, token).first<Player>();
        if (!rival || rival.stage !== player.stage || dist(player, rival) > 95) return snapshot(code, token);
        const attacked = await db().prepare("UPDATE players SET last_attack=? WHERE token=? AND last_attack<=?")
          .bind(now, token, now - cooldown).run();
        if (!attacked.meta.changes || rival.immune_until > now || rival.protected_until > now) return snapshot(code, token);
        if (rival.shield > 0) await db().prepare("UPDATE players SET shield=shield-1,immune_until=? WHERE token=? AND shield>0")
          .bind(now + 2500, rival.token).run();
        else await db().prepare(`UPDATE players SET dna=MAX(0,dna-1),
          wood=CASE WHEN dna=0 THEN MAX(0,wood-1) ELSE wood END,
          stone=CASE WHEN dna=0 AND wood=0 THEN MAX(0,stone-1) ELSE stone END,
          slowed_until=?,immune_until=? WHERE token=? AND immune_until<=?`)
          .bind(now + 1300, now + 2500, rival.token, now).run();
      }
      return snapshot(code, token);
    }

    if (action === "trap") {
      if (now - player.last_trap < 15000) return snapshot(code, token);
      const placed = await db().prepare("UPDATE players SET last_trap=? WHERE token=? AND last_trap<=?")
        .bind(now, token, now - 15000).run();
      if (placed.meta.changes) await db().prepare("INSERT INTO traps (id,room_code,stage,owner_token,x,y,expires_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), code, player.stage, token, player.x, player.y, now + 12000).run();
      return snapshot(code, token);
    }

    if (action === "gift") {
      if (now - player.last_gift < 2000) return snapshot(code, token);
      const range = 74 + player.mutations.split(",").filter((m) => m === "coop").length * 24;
      const friends = (await db().prepare("SELECT * FROM players WHERE room_code=? AND stage=? AND token!=?")
        .bind(code, player.stage, token).all<Player>()).results;
      const nearby = friends.filter((p) => dist(p, player) <= range).sort((a, b) => dist(a, player) - dist(b, player))[0];
      if (!nearby) return snapshot(code, token);
      const kind = player.stage === 4 ? player.wood > 0 && nearby.wood < 3 ? "wood" : "stone"
        : player.dna > 0 && nearby.dna < ERAS[player.stage].target ? "dna" : "stone";
      if (player[kind] <= 0 || nearby[kind] >= (kind === "wood" ? 3 : kind === "stone" ? 2 : ERAS[player.stage].target)) return snapshot(code, token);
      const given = await db().prepare(`UPDATE players SET ${kind}=${kind}-1,last_gift=? WHERE token=? AND ${kind}>0 AND last_gift<=?`)
        .bind(now, token, now - 2000).run();
      if (given.meta.changes) {
        await db().prepare(`UPDATE players SET ${kind}=MIN(?,${kind}+1),protected_until=MAX(protected_until,?) WHERE token=? AND stage=?`)
          .bind(kind === "wood" ? 3 : kind === "stone" ? 2 : ERAS[player.stage].target,
            player.mutations.split(",").filter((m) => m === "coop").length >= 2 ? now + 5000 : 0,
            nearby.token, player.stage).run();
      }
      return snapshot(code, token);
    }

    if (action !== "tick") return bad("Action inconnue.");
    const targetX = Number(body.x);
    const targetY = Number(body.y);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return bad("Position invalide.");
    const dt = limit((now - player.last_tick) / 1000, 0, 3);
    const maximum = speedFor(player.mutations) * (player.slowed_until > now ? 0.55 : 1) * dt + 22;
    const wanted = { x: limit(targetX, 24, W - 24), y: limit(targetY, 24, H - 24) };
    const previous = { x: player.x, y: player.y };
    const resourcesBefore = { dna: player.dna, wood: player.wood, stone: player.stone, shield: player.shield };
    const length = dist(wanted, player);
    if (player.stunned_until <= now && length) {
      const factor = Math.min(1, maximum / length);
      player.x += (wanted.x - player.x) * factor;
      player.y += (wanted.y - player.y) * factor;
    }

    const currentBucket = Math.floor(now / BUCKET_MS);
    const requestedBucket = Number(body.bucket);
    const bucket = requestedBucket === currentBucket - 1 && now % BUCKET_MS < 2000 ? requestedBucket : currentBucket;
    const items = itemsFor(code, player.stage, bucket);
    const attempts = Array.isArray(body.pickups) ? body.pickups.slice(0, 8) : [];
    const contacts = Array.isArray(body.contacts) ? body.contacts.slice(0, 8) as { index: number; x: number; y: number }[] : [];
    for (const raw of attempts) {
      const item = items.find((r) => r.index === raw);
      if (!item) continue;
      const travel = dist(previous, player);
      const along = travel ? limit(((item.x - previous.x) * (player.x - previous.x) + (item.y - previous.y) * (player.y - previous.y)) / (travel * travel), 0, 1) : 0;
      const contact = contacts.find((p) => p.index === raw);
      const touched = contact && Number.isFinite(contact.x) && Number.isFinite(contact.y)
        && dist(item, contact) <= pickupRadius(player.mutations) + 10
        && dist(previous, contact) <= maximum + 50 && dist(player, contact) <= maximum + 50;
      if (!touched && dist(item, { x: previous.x + (player.x - previous.x) * along,
        y: previous.y + (player.y - previous.y) * along }) > pickupRadius(player.mutations) + 22) continue;
      if (item.kind === "dna" && player.dna >= ERAS[player.stage].target) continue;
      if (item.kind === "stone" && player.stone >= 2) continue;
      if (item.kind === "wood" && player.wood >= 3) continue;
      const claim = await db().prepare("INSERT OR IGNORE INTO claims (room_code,stage,bucket,item,token) VALUES (?,?,?,?,?)")
        .bind(code, player.stage, bucket, item.index, token).run();
      if (claim.meta.changes) {
        if (item.kind === "dna") player.dna++;
        else if (item.kind === "stone") player.stone++;
        else player.wood++;
      }
    }

    await db().prepare("DELETE FROM traps WHERE room_code=? AND expires_at<=?").bind(code, now).run();
    const nearbyTraps = (await db().prepare("SELECT id,owner_token,x,y,expires_at FROM traps WHERE room_code=? AND stage=? AND expires_at>?")
      .bind(code, player.stage, now).all<TrapRow>()).results;
    for (const trap of nearbyTraps) if (trap.owner_token !== token && dist(trap, player) < 28) {
      const triggered = await db().prepare("UPDATE traps SET expires_at=0 WHERE id=? AND expires_at>?").bind(trap.id, now).run();
      if (triggered.meta.changes) player.slowed_until = Math.max(player.slowed_until, now + 2500);
    }
    const enemyRows = (await db().prepare("SELECT enemy,hp,respawn_until FROM enemies WHERE room_code=? AND stage=?")
      .bind(code, player.stage).all<EnemyRow>()).results;
    const threatened = dangersAt(player.stage, now).some((d) => {
      const row = enemyRows.find((r) => r.enemy === d.index);
      return (!row || row.hp > 0 || row.respawn_until <= now)
        && enemyPhase(now, d.index) >= 2000 && dist(d, player) < d.r + 12;
    });
    if (now - player.last_hit > 4300 && player.stunned_until <= now && player.protected_until <= now && threatened) {
      player.last_hit = now;
      if (player.shield > 0) player.shield--;
      else {
        let loss = 3;
        const fromDna = Math.min(loss, player.dna); player.dna -= fromDna; loss -= fromDna;
        const fromWood = Math.min(loss, player.wood); player.wood -= fromWood; loss -= fromWood;
        player.stone = Math.max(0, player.stone - loss);
        player.stunned_until = now + 1800;
      }
    }

    const marker = ERAS[player.stage].marker;
    if (marker && dist(marker, player) <= 55) {
      if (player.stage === 4 && player.wood >= 3 && player.stone >= 2) player.challenge = 1;
      else if (player.stage === 3 && player.dna >= 18 && player.stone >= 2) player.challenge = 1;
      else if (player.stage < 3 && player.dna >= ERAS[player.stage].target) player.challenge = 1;
    }
    await db().prepare(`UPDATE players SET x=?,y=?,dna=MIN(?,MAX(0,dna+?)),wood=MIN(3,MAX(0,wood+?)),
      stone=MIN(2,MAX(0,stone+?)),challenge=MAX(challenge,?),shield=MAX(0,shield+?),
      stunned_until=MAX(stunned_until,?),slowed_until=MAX(slowed_until,?),last_hit=MAX(last_hit,?),last_tick=?
      WHERE token=? AND stage=?`).bind(player.x, player.y, ERAS[player.stage].target,
      player.dna - resourcesBefore.dna, player.wood - resourcesBefore.wood, player.stone - resourcesBefore.stone,
      player.challenge, player.shield - resourcesBefore.shield, player.stunned_until, player.slowed_until,
      player.last_hit, now, token, player.stage).run();
    if (player.stage === 4 && player.challenge) {
      await db().prepare("UPDATE rooms SET status='done',winner_token=? WHERE code=? AND status='playing'").bind(token, code).run();
    }
    return snapshot(code, token);
  } catch (error) {
    console.error("game POST", error);
    return bad("La connexion au salon a échoué. Réessaie.", 503);
  }
}
