CREATE TYPE "public"."commodity_display_mode" AS ENUM('ticker-only', 'name-only', 'both');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('ICA', 'CIS', 'AIC', 'NCC');--> statement-breakpoint
CREATE TYPE "public"."location_display_mode" AS ENUM('names-only', 'natural-ids-only', 'both');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('Station', 'Planet');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('internal', 'partner');--> statement-breakpoint
CREATE TYPE "public"."sell_order_limit_mode" AS ENUM('none', 'max_sell', 'reserve');--> statement-breakpoint
CREATE TABLE "buy_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"order_type" "order_type" DEFAULT 'internal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_role_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_role_id" varchar(100) NOT NULL,
	"discord_role_name" varchar(100) NOT NULL,
	"app_role_id" varchar(50) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_commodities" (
	"ticker" varchar(10) PRIMARY KEY NOT NULL,
	"material_id" varchar(40),
	"name" varchar(100) NOT NULL,
	"category_name" varchar(50),
	"category_id" varchar(40),
	"weight" numeric(10, 6),
	"volume" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_storage_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_locations" (
	"natural_id" varchar(20) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "location_type" NOT NULL,
	"system_id" varchar(40),
	"system_natural_id" varchar(20) NOT NULL,
	"system_name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_user_storage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"storage_id" varchar(40) NOT NULL,
	"location_id" varchar(20),
	"type" varchar(30) NOT NULL,
	"fio_uploaded_at" timestamp,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" varchar(50) NOT NULL,
	"permission_id" varchar(100) NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT 'grey' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sell_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"order_type" "order_type" DEFAULT 'internal' NOT NULL,
	"limit_mode" "sell_order_limit_mode" DEFAULT 'none' NOT NULL,
	"limit_quantity" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"changed_by_user_id" integer,
	"effective_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_discord_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"discord_id" varchar(100) NOT NULL,
	"discord_username" varchar(100) NOT NULL,
	"discord_avatar" varchar(255),
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_discord_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_discord_profiles_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fio_username" varchar(100),
	"fio_api_key" text,
	"preferred_currency" "currency" DEFAULT 'CIS' NOT NULL,
	"location_display_mode" "location_display_mode" DEFAULT 'both' NOT NULL,
	"commodity_display_mode" "commodity_display_mode" DEFAULT 'both' NOT NULL,
	"fio_auto_sync" boolean DEFAULT true NOT NULL,
	"fio_excluded_locations" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"email" varchar(255),
	"display_name" varchar(100) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "buy_orders" ADD CONSTRAINT "buy_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_orders" ADD CONSTRAINT "buy_orders_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_orders" ADD CONSTRAINT "buy_orders_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_mappings" ADD CONSTRAINT "discord_role_mappings_app_role_id_roles_id_fk" FOREIGN KEY ("app_role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_inventory" ADD CONSTRAINT "fio_inventory_user_storage_id_fio_user_storage_id_fk" FOREIGN KEY ("user_storage_id") REFERENCES "public"."fio_user_storage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_inventory" ADD CONSTRAINT "fio_inventory_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_storage" ADD CONSTRAINT "fio_user_storage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_storage" ADD CONSTRAINT "fio_user_storage_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_orders" ADD CONSTRAINT "sell_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_orders" ADD CONSTRAINT "sell_orders_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_orders" ADD CONSTRAINT "sell_orders_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_discord_profiles" ADD CONSTRAINT "user_discord_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buy_orders_user_commodity_location_type_currency_idx" ON "buy_orders" USING btree ("user_id","commodity_ticker","location_id","order_type","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_role_mappings_discord_role_idx" ON "discord_role_mappings" USING btree ("discord_role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fio_user_storage_user_storage_idx" ON "fio_user_storage" USING btree ("user_id","storage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sell_orders_user_commodity_location_type_currency_idx" ON "sell_orders" USING btree ("user_id","commodity_ticker","location_id","order_type","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_effective_idx" ON "settings" USING btree ("key","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_discord_profiles_discord_id_idx" ON "user_discord_profiles" USING btree ("discord_id");