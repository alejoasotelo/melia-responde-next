CREATE TABLE "meli_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"connected_by" integer,
	"meli_user_id" bigint NOT NULL,
	"nickname" varchar(100),
	"site_id" varchar(10),
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meli_accounts_meli_user_id_unique" UNIQUE("meli_user_id")
);
--> statement-breakpoint
ALTER TABLE "meli_accounts" ADD CONSTRAINT "meli_accounts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meli_accounts" ADD CONSTRAINT "meli_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;