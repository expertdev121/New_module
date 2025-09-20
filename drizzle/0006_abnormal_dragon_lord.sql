CREATE TYPE "public"."distribution_type" AS ENUM('fixed', 'custom');--> statement-breakpoint
CREATE TYPE "public"."installment_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'expected';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'grandchild' BEFORE 'grandfather';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Sister';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Sister';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Brother';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Brother';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Aunt';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Aunt';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Uncle';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Uncle';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Parents';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Parents';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Mother';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Mother';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Father';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Nephew';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Nephew';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Niece';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Niece';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Grandparents';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Grandparents';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Father';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Their Daughter';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Their Son';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Daughter';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Son';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Daughter';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Son';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Cousin (M)';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Grandfather';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Grandmother';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Grandfather';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Grandmother';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Wife';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Husband';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Former Husband';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Former Wife';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Cousin (F)';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Cousin (M)';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Cousin (F)';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Partner';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Friend';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Neighbor';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Relative';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Business';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Chevrusa';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Congregant';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Contact';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Donor';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Fiance';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Foundation';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Fund';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Her Step Son';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'His Step Mother';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Owner';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Rabbi';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Their Granddaughter';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Their Grandson';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Employee';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'Employer';--> statement-breakpoint
CREATE TABLE "category_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_conversion_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"from_currency" "currency" NOT NULL,
	"to_currency" "currency" NOT NULL,
	"from_amount" numeric(10, 2) NOT NULL,
	"to_amount" numeric(10, 2) NOT NULL,
	"exchange_rate" numeric(10, 4) NOT NULL,
	"conversion_date" date NOT NULL,
	"conversion_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rate" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_currency" "currency" DEFAULT 'USD' NOT NULL,
	"target_currency" "currency" NOT NULL,
	"rate" numeric(18, 6) NOT NULL,
	"date" date NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installment_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_plan_id" integer NOT NULL,
	"installment_date" date NOT NULL,
	"installment_amount" numeric(10, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"installment_amount_usd" numeric(10, 2),
	"status" "installment_status" DEFAULT 'pending' NOT NULL,
	"paid_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"payment_id" integer
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"pledge_id" integer NOT NULL,
	"installment_schedule_id" integer,
	"payer_contact_id" integer,
	"allocated_amount" numeric(10, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"allocated_amount_usd" numeric(10, 2),
	"allocated_amount_in_pledge_currency" numeric(10, 2),
	"receipt_number" text,
	"receipt_type" "receipt_type",
	"receipt_issued" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" DROP CONSTRAINT "contact_email_unique";--> statement-breakpoint
ALTER TABLE "payment" DROP CONSTRAINT "payment_pledge_id_pledge_id_fk";
--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "payment_method" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."payment_method";--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('ach', 'bill_pay', 'cash', 'check', 'credit', 'credit_card', 'expected', 'goods_and_services', 'matching_funds', 'money_order', 'p2p', 'pending', 'bank_transfer', 'refund', 'scholarship', 'stock', 'student_portion', 'unknown', 'wire', 'xfer', 'other');--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "payment_method" SET DATA TYPE "public"."payment_method" USING "payment_method"::"public"."payment_method";--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "pledge_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "ghl_contact_id" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "installment_schedule_id" integer;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "relationship_id" integer;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "payer_contact_id" integer;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "is_third_party_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "amount_in_pledge_currency" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "pledge_currency_exchange_rate" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "amount_in_plan_currency" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "plan_currency_exchange_rate" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "check_date" date;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "account" text;--> statement-breakpoint
ALTER TABLE "payment_plan" ADD COLUMN "relationship_id" integer;--> statement-breakpoint
ALTER TABLE "payment_plan" ADD COLUMN "distribution_type" "distribution_type" DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_plan" ADD COLUMN "total_planned_amount_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment_plan" ADD COLUMN "installment_amount_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment_plan" ADD COLUMN "remaining_amount_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment_plan" ADD COLUMN "currency_priority" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pledge" ADD COLUMN "relationship_id" integer;--> statement-breakpoint
ALTER TABLE "pledge" ADD COLUMN "campaign_code" text;--> statement-breakpoint
ALTER TABLE "category_item" ADD CONSTRAINT "category_item_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_conversion_log" ADD CONSTRAINT "currency_conversion_log_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_schedule" ADD CONSTRAINT "installment_schedule_payment_plan_id_payment_plan_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_pledge_id_pledge_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installment_schedule_id_installment_schedule_id_fk" FOREIGN KEY ("installment_schedule_id") REFERENCES "public"."installment_schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payer_contact_id_contact_id_fk" FOREIGN KEY ("payer_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "currency_conversion_log_payment_id_idx" ON "currency_conversion_log" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "currency_conversion_log_date_idx" ON "currency_conversion_log" USING btree ("conversion_date");--> statement-breakpoint
CREATE INDEX "currency_conversion_log_type_idx" ON "currency_conversion_log" USING btree ("conversion_type");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rate_unique_idx" ON "exchange_rate" USING btree ("base_currency","target_currency","date");--> statement-breakpoint
CREATE INDEX "exchange_rate_base_currency_idx" ON "exchange_rate" USING btree ("base_currency");--> statement-breakpoint
CREATE INDEX "exchange_rate_target_currency_idx" ON "exchange_rate" USING btree ("target_currency");--> statement-breakpoint
CREATE INDEX "exchange_rate_date_idx" ON "exchange_rate" USING btree ("date");--> statement-breakpoint
CREATE INDEX "installment_schedule_payment_plan_id_idx" ON "installment_schedule" USING btree ("payment_plan_id");--> statement-breakpoint
CREATE INDEX "installment_schedule_installment_date_idx" ON "installment_schedule" USING btree ("installment_date");--> statement-breakpoint
CREATE INDEX "installment_schedule_status_idx" ON "installment_schedule" USING btree ("status");--> statement-breakpoint
CREATE INDEX "installment_schedule_payment_id_idx" ON "installment_schedule" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_pledge_id_idx" ON "payment_allocations" USING btree ("pledge_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payer_contact_id_idx" ON "payment_allocations" USING btree ("payer_contact_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_installment_schedule_id_idx" ON "payment_allocations" USING btree ("installment_schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_unique" ON "payment_allocations" USING btree ("payment_id","pledge_id","installment_schedule_id");--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_installment_schedule_id_installment_schedule_id_fk" FOREIGN KEY ("installment_schedule_id") REFERENCES "public"."installment_schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_payer_contact_id_contact_id_fk" FOREIGN KEY ("payer_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_pledge_id_pledge_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledge"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan" ADD CONSTRAINT "payment_plan_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge" ADD CONSTRAINT "pledge_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_relationship_id_idx" ON "payment" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "payment_payer_contact_id_idx" ON "payment" USING btree ("payer_contact_id");--> statement-breakpoint
CREATE INDEX "payment_is_third_party_idx" ON "payment" USING btree ("is_third_party_payment");--> statement-breakpoint
CREATE INDEX "payment_installment_schedule_id_idx" ON "payment" USING btree ("installment_schedule_id");--> statement-breakpoint
CREATE INDEX "payment_currency_idx" ON "payment" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "payment_plan_relationship_id_idx" ON "payment_plan" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "payment_plan_currency_idx" ON "payment_plan" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "payment_plan_currency_priority_idx" ON "payment_plan" USING btree ("pledge_id","currency_priority");--> statement-breakpoint
CREATE INDEX "pledge_contact_id_idx" ON "pledge" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "pledge_category_id_idx" ON "pledge" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "pledge_relationship_id_idx" ON "pledge" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "pledge_pledge_date_idx" ON "pledge" USING btree ("pledge_date");--> statement-breakpoint
CREATE INDEX "pledge_currency_idx" ON "pledge" USING btree ("currency");--> statement-breakpoint
ALTER TABLE "payment" DROP COLUMN "amount_pledge_currency";