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
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_user_id_unique";--> statement-breakpoint
ALTER TABLE "buy_orders" ADD COLUMN "price_list_code" varchar(20);--> statement-breakpoint
ALTER TABLE "sell_orders" ADD COLUMN "price_list_code" varchar(20);--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "setting_key" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "value" text NOT NULL;--> statement-breakpoint
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
CREATE UNIQUE INDEX "user_settings_user_key_idx" ON "user_settings" USING btree ("user_id","setting_key");--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "fio_username";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "fio_api_key";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "preferred_currency";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "location_display_mode";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "commodity_display_mode";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "fio_auto_sync";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "fio_excluded_locations";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "created_at";