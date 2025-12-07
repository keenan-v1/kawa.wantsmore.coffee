CREATE TYPE "public"."adjustment_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('manual', 'csv_import', 'google_sheets', 'fio_exchange');--> statement-breakpoint
CREATE TABLE "fio_exchanges" (
	"code" varchar(20) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"location_id" varchar(20),
	"currency" "currency" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"exchange_code" varchar(20),
	"commodity_ticker" varchar(10),
	"location_id" varchar(20),
	"currency" "currency",
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
	"id" serial PRIMARY KEY NOT NULL,
	"exchange_code" varchar(20) NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"source" "price_source" NOT NULL,
	"source_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fio_exchanges" ADD CONSTRAINT "fio_exchanges_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_adjustments_lookup_idx" ON "price_adjustments" USING btree ("exchange_code","location_id","commodity_ticker");--> statement-breakpoint
CREATE INDEX "price_adjustments_active_idx" ON "price_adjustments" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_exchange_commodity_location_currency_idx" ON "price_lists" USING btree ("exchange_code","commodity_ticker","location_id","currency");--> statement-breakpoint
CREATE INDEX "price_lists_exchange_idx" ON "price_lists" USING btree ("exchange_code");