CREATE TYPE "public"."commodity_display_mode" AS ENUM('ticker-only', 'name-only', 'both');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('ICA', 'CIS', 'AIC', 'NCC');--> statement-breakpoint
CREATE TYPE "public"."location_display_mode" AS ENUM('names-only', 'natural-ids-only', 'both');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('Station', 'Planet');--> statement-breakpoint
CREATE TABLE "commodities" (
	"ticker" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demands" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"quantity" integer NOT NULL,
	"max_price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"delivery_location_id" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "location_type" NOT NULL,
	"system_code" varchar(20) NOT NULL,
	"system_name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"location_id" varchar(20) NOT NULL,
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
CREATE TABLE "roles" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
ALTER TABLE "demands" ADD CONSTRAINT "demands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demands" ADD CONSTRAINT "demands_commodity_ticker_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demands" ADD CONSTRAINT "demands_delivery_location_id_locations_id_fk" FOREIGN KEY ("delivery_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_commodity_ticker_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_commodity_ticker_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;