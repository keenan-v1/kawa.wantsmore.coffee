CREATE TYPE "public"."notification_type" AS ENUM('reservation_placed', 'reservation_confirmed', 'reservation_rejected', 'reservation_fulfilled', 'reservation_cancelled', 'reservation_expired', 'user_needs_approval', 'user_auto_approved', 'user_approved', 'user_rejected');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'rejected', 'fulfilled', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text,
	"data" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"buy_order_id" integer NOT NULL,
	"sell_order_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reservations" ADD CONSTRAINT "order_reservations_buy_order_id_buy_orders_id_fk" FOREIGN KEY ("buy_order_id") REFERENCES "public"."buy_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reservations" ADD CONSTRAINT "order_reservations_sell_order_id_sell_orders_id_fk" FOREIGN KEY ("sell_order_id") REFERENCES "public"."sell_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "order_reservations_buy_order_idx" ON "order_reservations" USING btree ("buy_order_id");--> statement-breakpoint
CREATE INDEX "order_reservations_sell_order_idx" ON "order_reservations" USING btree ("sell_order_id");