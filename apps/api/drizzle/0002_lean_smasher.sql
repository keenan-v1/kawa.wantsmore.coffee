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
ALTER TABLE "user_settings" ADD COLUMN "fio_auto_sync" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "fio_excluded_locations" text[];--> statement-breakpoint
ALTER TABLE "buy_orders" ADD CONSTRAINT "buy_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_orders" ADD CONSTRAINT "buy_orders_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_orders" ADD CONSTRAINT "buy_orders_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_mappings" ADD CONSTRAINT "discord_role_mappings_app_role_id_roles_id_fk" FOREIGN KEY ("app_role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_discord_profiles" ADD CONSTRAINT "user_discord_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buy_orders_user_commodity_location_type_currency_idx" ON "buy_orders" USING btree ("user_id","commodity_ticker","location_id","order_type","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_role_mappings_discord_role_idx" ON "discord_role_mappings" USING btree ("discord_role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_effective_idx" ON "settings" USING btree ("key","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_discord_profiles_discord_id_idx" ON "user_discord_profiles" USING btree ("discord_id");