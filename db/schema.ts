import { pgTable, text, integer, boolean, timestamp, jsonb, bigserial, primaryKey, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const players = pgTable("players", {
  id: text().primaryKey(),
  secretHash: text("secret_hash").notNull(),
  name: text().notNull(),
  skin: text().notNull().default("cyber"),
  trophies: integer().notNull().default(0),
  xp: integer().notNull().default(0),
  wins: integer().notNull().default(0),
  kills: integer().notNull().default(0),
  matches: integer().notNull().default(0),
  bestPlacement: integer("best_placement"),
  lastChatAt: timestamp("last_chat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("players_trophies_idx").on(t.trophies)]);

export const rooms = pgTable("rooms", {
  id: text().primaryKey().default(sql`gen_random_uuid()::text`),
  mode: text().notNull(), // 'battle' | 'open'
  code: text(),
  seed: integer().notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  bots: jsonb().notNull().default(sql`'[]'::jsonb`),
  scores: jsonb().notNull().default(sql`'{}'::jsonb`),
  deaths: integer().notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("rooms_mode_start_idx").on(t.mode, t.startAt),
  index("rooms_ended_idx").on(t.endedAt),
]);

export const roomMembers = pgTable("room_members", {
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  playerId: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  state: jsonb(),
  alive: boolean().notNull().default(true),
  left: boolean().notNull().default(false),
  placement: integer(),
  rewarded: boolean().notNull().default(false),
  result: jsonb(),
}, (t) => [
  primaryKey({ columns: [t.roomId, t.playerId] }),
  index("room_members_player_idx").on(t.playerId),
]);

export const events = pgTable("events", {
  id: bigserial({ mode: "number" }).primaryKey(),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  fromId: text("from_id").notNull(),
  type: text().notNull(),
  data: jsonb().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("events_room_id_idx").on(t.roomId, t.id),
  index("events_created_idx").on(t.createdAt),
]);
