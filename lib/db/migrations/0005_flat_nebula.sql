CREATE TABLE "answer_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"meli_account_id" integer NOT NULL,
	"meli_question_id" bigint NOT NULL,
	"text" text NOT NULL,
	"sent_by" integer,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"batch_id" varchar(36) NOT NULL,
	"status" varchar(10) NOT NULL,
	"error" text,
	CONSTRAINT "answer_submissions_meli_account_id_meli_question_id_unique" UNIQUE("meli_account_id","meli_question_id")
);
--> statement-breakpoint
CREATE TABLE "meli_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"meli_account_id" integer NOT NULL,
	"item_id" varchar(20) NOT NULL,
	"title" text NOT NULL,
	"thumbnail" text,
	"permalink" text,
	"price" numeric(14, 2),
	"currency_id" varchar(10),
	"available_quantity" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meli_items_meli_account_id_item_id_unique" UNIQUE("meli_account_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "meli_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"meli_account_id" integer NOT NULL,
	"meli_question_id" bigint NOT NULL,
	"item_id" varchar(20) NOT NULL,
	"text" text NOT NULL,
	"status" varchar(30) NOT NULL,
	"from_user_id" bigint,
	"date_created" timestamp NOT NULL,
	"answer_text" text,
	"answer_date" timestamp,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meli_questions_meli_account_id_meli_question_id_unique" UNIQUE("meli_account_id","meli_question_id")
);
--> statement-breakpoint
ALTER TABLE "meli_accounts" ADD COLUMN "questions_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "meli_accounts" ADD COLUMN "items_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "meli_accounts" ADD COLUMN "sync_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "meli_accounts" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "answer_submissions" ADD CONSTRAINT "answer_submissions_meli_account_id_meli_accounts_id_fk" FOREIGN KEY ("meli_account_id") REFERENCES "public"."meli_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_submissions" ADD CONSTRAINT "answer_submissions_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meli_items" ADD CONSTRAINT "meli_items_meli_account_id_meli_accounts_id_fk" FOREIGN KEY ("meli_account_id") REFERENCES "public"."meli_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meli_questions" ADD CONSTRAINT "meli_questions_meli_account_id_meli_accounts_id_fk" FOREIGN KEY ("meli_account_id") REFERENCES "public"."meli_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meli_items_account_status_idx" ON "meli_items" USING btree ("meli_account_id","status");--> statement-breakpoint
CREATE INDEX "meli_questions_account_status_idx" ON "meli_questions" USING btree ("meli_account_id","status","date_created");