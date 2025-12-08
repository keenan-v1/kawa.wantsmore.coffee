-- ==================== PRICING SYSTEM ====================
CREATE TYPE "public"."adjustment_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."import_format" AS ENUM('flat', 'pivot', 'kawa');--> statement-breakpoint
CREATE TYPE "public"."import_source_type" AS ENUM('csv', 'google_sheets');--> statement-breakpoint
CREATE TYPE "public"."price_list_type" AS ENUM('fio', 'custom');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('manual', 'csv_import', 'google_sheets', 'fio_exchange');--> statement-breakpoint
CREATE TABLE "import_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_list_code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"source_type" "import_source_type" NOT NULL,
	"format" "import_format" NOT NULL,
	"sheets_url" text,
	"sheet_gid" integer,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_list_code" varchar(20),
	"commodity_ticker" varchar(10),
	"location_id" varchar(20),
	"adjustment_type" "adjustment_type" NOT NULL,
	"adjustment_value" numeric(12, 4) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp,
	"effective_until" timestamp,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"code" varchar(20) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"type" "price_list_type" NOT NULL,
	"currency" "currency" NOT NULL,
	"default_location_id" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_list_code" varchar(20) NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"source" "price_source" NOT NULL,
	"source_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_configs" ADD CONSTRAINT "import_configs_price_list_code_price_lists_code_fk" FOREIGN KEY ("price_list_code") REFERENCES "public"."price_lists"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_price_list_code_price_lists_code_fk" FOREIGN KEY ("price_list_code") REFERENCES "public"."price_lists"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_default_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_price_list_code_price_lists_code_fk" FOREIGN KEY ("price_list_code") REFERENCES "public"."price_lists"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_configs_price_list_idx" ON "import_configs" USING btree ("price_list_code");--> statement-breakpoint
CREATE INDEX "price_adjustments_lookup_idx" ON "price_adjustments" USING btree ("price_list_code","location_id","commodity_ticker");--> statement-breakpoint
CREATE INDEX "price_adjustments_active_idx" ON "price_adjustments" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_price_list_commodity_location_idx" ON "prices" USING btree ("price_list_code","commodity_ticker","location_id");--> statement-breakpoint
CREATE INDEX "prices_price_list_idx" ON "prices" USING btree ("price_list_code");--> statement-breakpoint

-- ==================== USER SETTINGS MIGRATION ====================
-- Migrate from old user_settings table (one row per user with fixed columns)
-- to user_setting_values table (key-value store, many rows per user)
-- Then rename user_setting_values to user_settings

-- Step 1: Copy FIO credentials from old table to new key-value table
INSERT INTO user_setting_values (user_id, setting_key, value, updated_at)
SELECT
  user_id,
  'fio.username',
  '"' || fio_username || '"',  -- JSON encode as string
  COALESCE(updated_at, NOW())
FROM user_settings
WHERE fio_username IS NOT NULL AND fio_username != ''
ON CONFLICT (user_id, setting_key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();--> statement-breakpoint

INSERT INTO user_setting_values (user_id, setting_key, value, updated_at)
SELECT
  user_id,
  'fio.apiKey',
  '"' || fio_api_key || '"',  -- JSON encode as string
  COALESCE(updated_at, NOW())
FROM user_settings
WHERE fio_api_key IS NOT NULL AND fio_api_key != ''
ON CONFLICT (user_id, setting_key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();--> statement-breakpoint

-- Step 2: Drop the old user_settings table
DROP TABLE user_settings;--> statement-breakpoint

-- Step 3: Rename user_setting_values to user_settings
ALTER TABLE user_setting_values RENAME TO user_settings;--> statement-breakpoint

-- Step 4: Rename the unique index to match new table name
ALTER INDEX user_setting_values_user_key_idx RENAME TO user_settings_user_key_idx;--> statement-breakpoint

-- Step 5: Rename the foreign key constraint
ALTER TABLE user_settings RENAME CONSTRAINT user_setting_values_user_id_users_id_fk TO user_settings_user_id_users_id_fk;--> statement-breakpoint

-- Step 6: Rename the sequence for the id column
ALTER SEQUENCE user_setting_values_id_seq RENAME TO user_settings_id_seq;