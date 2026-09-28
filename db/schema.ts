import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  hostToken: text("host_token").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at"),
  endsAt: integer("ends_at"),
  winnerToken: text("winner_token"),
});

export const players = sqliteTable("players", {
  token: text("token").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  roomCode: text("room_code").notNull().references(() => rooms.code),
  name: text("name").notNull(),
  color: text("color").notNull(),
  stage: integer("stage").notNull().default(0),
  dna: integer("dna").notNull().default(0),
  wood: integer("wood").notNull().default(0),
  stone: integer("stone").notNull().default(0),
  challenge: integer("challenge").notNull().default(0),
  x: real("x").notNull().default(90),
  y: real("y").notNull().default(300),
  mutations: text("mutations").notNull().default(""),
  shield: integer("shield").notNull().default(0),
  stunnedUntil: integer("stunned_until").notNull().default(0),
  lastHit: integer("last_hit").notNull().default(0),
  lastAttack: integer("last_attack").notNull().default(0),
  lastTrap: integer("last_trap").notNull().default(0),
  lastGift: integer("last_gift").notNull().default(0),
  slowedUntil: integer("slowed_until").notNull().default(0),
  immuneUntil: integer("immune_until").notNull().default(0),
  protectedUntil: integer("protected_until").notNull().default(0),
  bossScore: integer("boss_score").notNull().default(0),
  eraBossScore: integer("era_boss_score").notNull().default(0),
  lastTick: integer("last_tick").notNull().default(0),
  evolvedAt: integer("evolved_at").notNull().default(0),
  joinedAt: integer("joined_at").notNull(),
}, (table) => [index("idx_players_room").on(table.roomCode)]);

export const claims = sqliteTable("claims", {
  roomCode: text("room_code").notNull(),
  stage: integer("stage").notNull(),
  bucket: integer("bucket").notNull(),
  item: integer("item").notNull(),
  token: text("token").notNull(),
}, (table) => [primaryKey({ columns: [table.roomCode, table.stage, table.bucket, table.item] })]);

export const enemies = sqliteTable("enemies", {
  roomCode: text("room_code").notNull(),
  stage: integer("stage").notNull(),
  enemy: integer("enemy").notNull(),
  hp: integer("hp").notNull(),
  respawnUntil: integer("respawn_until").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.roomCode, table.stage, table.enemy] })]);

export const enemyHits = sqliteTable("enemy_hits", {
  roomCode: text("room_code").notNull(),
  stage: integer("stage").notNull(),
  enemy: integer("enemy").notNull(),
  token: text("token").notNull(),
  hitAt: integer("hit_at").notNull(),
}, (table) => [primaryKey({ columns: [table.roomCode, table.stage, table.enemy, table.token] })]);

export const traps = sqliteTable("traps", {
  id: text("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  stage: integer("stage").notNull(),
  ownerToken: text("owner_token").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
