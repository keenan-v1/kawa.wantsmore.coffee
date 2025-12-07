CREATE TYPE "public"."import_config_type" AS ENUM('google_sheets', 'csv_url');--> statement-breakpoint
CREATE TABLE "price_import_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "import_config_type" NOT NULL,
	"exchange_code" varchar(20) NOT NULL,
	"url" text NOT NULL,
	"sheet_gid" integer,
	"field_mapping" jsonb NOT NULL,
	"location_default" varchar(20),
	"currency_default" "currency",
	"auto_sync" boolean DEFAULT false NOT NULL,
	"sync_interval_hours" integer DEFAULT 24 NOT NULL,
	"last_synced_at" timestamp,
	"last_sync_result" jsonb,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_import_configs" ADD CONSTRAINT "price_import_configs_location_default_fio_locations_natural_id_fk" FOREIGN KEY ("location_default") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_import_configs" ADD CONSTRAINT "price_import_configs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_import_configs_user_idx" ON "price_import_configs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "price_import_configs_auto_sync_idx" ON "price_import_configs" USING btree ("auto_sync");