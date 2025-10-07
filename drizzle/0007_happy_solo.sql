CREATE TYPE "public"."role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "category_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" integer NOT NULL,
	"category_item_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pledge_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"pledge_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"show_on_payment" boolean DEFAULT true NOT NULL,
	"show_on_pledge" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tag_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "category_item" ADD COLUMN "occ_id" integer;--> statement-breakpoint
ALTER TABLE "category_item" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "category_group" ADD CONSTRAINT "category_group_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_group" ADD CONSTRAINT "category_group_category_item_id_category_item_id_fk" FOREIGN KEY ("category_item_id") REFERENCES "public"."category_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_tags" ADD CONSTRAINT "payment_tags_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_tags" ADD CONSTRAINT "payment_tags_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_tags" ADD CONSTRAINT "pledge_tags_pledge_id_pledge_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_tags" ADD CONSTRAINT "pledge_tags_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_tags_payment_id_idx" ON "payment_tags" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_tags_tag_id_idx" ON "payment_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_tags_unique" ON "payment_tags" USING btree ("payment_id","tag_id");--> statement-breakpoint
CREATE INDEX "pledge_tags_pledge_id_idx" ON "pledge_tags" USING btree ("pledge_id");--> statement-breakpoint
CREATE INDEX "pledge_tags_tag_id_idx" ON "pledge_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pledge_tags_unique" ON "pledge_tags" USING btree ("pledge_id","tag_id");