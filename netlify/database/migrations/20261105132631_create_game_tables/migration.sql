CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY,
	"room_id" text NOT NULL,
	"from_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY,
	"secret_hash" text NOT NULL,
	"name" text NOT NULL,
	"skin" text DEFAULT 'cyber' NOT NULL,
	"trophies" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"best_placement" integer,
	"last_chat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" text,
	"player_id" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"state" jsonb,
	"alive" boolean DEFAULT true NOT NULL,
	"left" boolean DEFAULT false NOT NULL,
	"placement" integer,
	"rewarded" boolean DEFAULT false NOT NULL,
	"result" jsonb,
	CONSTRAINT "room_members_pkey" PRIMARY KEY("room_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"mode" text NOT NULL,
	"code" text,
	"seed" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"bots" jsonb DEFAULT '[]' NOT NULL,
	"scores" jsonb DEFAULT '{}' NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_room_id_idx" ON "events" ("room_id","id");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" ("created_at");--> statement-breakpoint
CREATE INDEX "players_trophies_idx" ON "players" ("trophies");--> statement-breakpoint
CREATE INDEX "room_members_player_idx" ON "room_members" ("player_id");--> statement-breakpoint
CREATE INDEX "rooms_mode_start_idx" ON "rooms" ("mode","start_at");--> statement-breakpoint
CREATE INDEX "rooms_ended_idx" ON "rooms" ("ended_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE;