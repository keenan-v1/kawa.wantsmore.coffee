CREATE TYPE "public"."fio_contract_status" AS ENUM('pending', 'partially_fulfilled', 'fulfilled', 'closed', 'breached', 'terminated');--> statement-breakpoint
CREATE TABLE "fio_contract_conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"fio_condition_id" varchar(50) NOT NULL,
	"condition_index" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"party" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"material_ticker" varchar(10),
	"material_amount" integer,
	"location_raw" varchar(100),
	"location_id" varchar(20),
	"payment_amount" numeric(18, 2),
	"payment_currency" varchar(10),
	"reservation_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fio_contract_conditions_fio_condition_id_unique" UNIQUE("fio_condition_id")
);
--> statement-breakpoint
CREATE TABLE "fio_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"fio_contract_id" varchar(50) NOT NULL,
	"local_id" varchar(20) NOT NULL,
	"synced_by_user_id" integer NOT NULL,
	"user_party" varchar(20) NOT NULL,
	"partner_company_code" varchar(20),
	"partner_name" varchar(100) NOT NULL,
	"partner_user_id" integer,
	"status" "fio_contract_status" NOT NULL,
	"name" varchar(200),
	"preamble" text,
	"contract_date_ms" bigint NOT NULL,
	"due_date_ms" bigint,
	"fio_timestamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fio_contracts_fio_contract_id_unique" UNIQUE("fio_contract_id")
);
--> statement-breakpoint
CREATE TABLE "fio_user_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fio_user_id" varchar(50) NOT NULL,
	"fio_user_name" varchar(100) NOT NULL,
	"company_id" varchar(50),
	"company_name" varchar(100),
	"company_code" varchar(20),
	"corporation_id" varchar(50),
	"corporation_name" varchar(100),
	"corporation_code" varchar(20),
	"country_id" varchar(50),
	"country_code" varchar(20),
	"country_name" varchar(100),
	"fio_timestamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fio_user_data_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "order_reservations" ADD COLUMN "fio_condition_id" integer;--> statement-breakpoint
ALTER TABLE "fio_contract_conditions" ADD CONSTRAINT "fio_contract_conditions_contract_id_fio_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."fio_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_contract_conditions" ADD CONSTRAINT "fio_contract_conditions_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_contract_conditions" ADD CONSTRAINT "fio_contract_conditions_reservation_id_order_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."order_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_contracts" ADD CONSTRAINT "fio_contracts_synced_by_user_id_users_id_fk" FOREIGN KEY ("synced_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_contracts" ADD CONSTRAINT "fio_contracts_partner_user_id_users_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_data" ADD CONSTRAINT "fio_user_data_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fio_contract_conditions_contract_idx" ON "fio_contract_conditions" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "fio_contract_conditions_reservation_idx" ON "fio_contract_conditions" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "fio_contract_conditions_material_idx" ON "fio_contract_conditions" USING btree ("material_ticker","location_id");--> statement-breakpoint
CREATE INDEX "fio_contracts_synced_by_idx" ON "fio_contracts" USING btree ("synced_by_user_id");--> statement-breakpoint
CREATE INDEX "fio_contracts_partner_idx" ON "fio_contracts" USING btree ("partner_user_id");--> statement-breakpoint
CREATE INDEX "fio_contracts_local_id_idx" ON "fio_contracts" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "fio_user_data_company_code_idx" ON "fio_user_data" USING btree ("company_code");--> statement-breakpoint
CREATE INDEX "fio_user_data_corporation_code_idx" ON "fio_user_data" USING btree ("corporation_code");--> statement-breakpoint
CREATE INDEX "order_reservations_fio_condition_idx" ON "order_reservations" USING btree ("fio_condition_id");