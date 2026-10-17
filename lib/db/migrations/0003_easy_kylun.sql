CREATE TABLE "meli_item_contexts" (
	"id" serial PRIMARY KEY NOT NULL,
	"meli_account_id" integer NOT NULL,
	"item_id" varchar(20) NOT NULL,
	"context" text NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meli_item_contexts_meli_account_id_item_id_unique" UNIQUE("meli_account_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "question_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"meli_account_id" integer NOT NULL,
	"meli_question_id" bigint NOT NULL,
	"item_id" varchar(20) NOT NULL,
	"draft" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "question_drafts_meli_account_id_meli_question_id_unique" UNIQUE("meli_account_id","meli_question_id")
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "mp_subscription_id" text;--> statement-breakpoint
ALTER TABLE "meli_item_contexts" ADD CONSTRAINT "meli_item_contexts_meli_account_id_meli_accounts_id_fk" FOREIGN KEY ("meli_account_id") REFERENCES "public"."meli_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meli_item_contexts" ADD CONSTRAINT "meli_item_contexts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_drafts" ADD CONSTRAINT "question_drafts_meli_account_id_meli_accounts_id_fk" FOREIGN KEY ("meli_account_id") REFERENCES "public"."meli_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_drafts" ADD CONSTRAINT "question_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_mp_subscription_id_unique" UNIQUE("mp_subscription_id");