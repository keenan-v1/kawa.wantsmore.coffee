-- Modify order_reservations to use new simplified structure
-- Old: buyOrderId + sellOrderId (both required, linking buyer's order to seller's order)
-- New: one of sellOrderId/buyOrderId + counterpartyUserId (who is reserving/filling)

-- Step 1: Add counterparty_user_id as nullable first
ALTER TABLE "order_reservations" ADD COLUMN "counterparty_user_id" integer;--> statement-breakpoint

-- Step 2: For existing reservations (which were created by buyers reserving from sell orders),
-- set counterparty_user_id to the buyer's user ID (from the buy order)
UPDATE "order_reservations" r
SET "counterparty_user_id" = b."user_id"
FROM "buy_orders" b
WHERE r."buy_order_id" = b."id";--> statement-breakpoint

-- Step 3: Make counterparty_user_id NOT NULL now that it's populated
ALTER TABLE "order_reservations" ALTER COLUMN "counterparty_user_id" SET NOT NULL;--> statement-breakpoint

-- Step 4: Add foreign key constraint
ALTER TABLE "order_reservations" ADD CONSTRAINT "order_reservations_counterparty_user_id_users_id_fk" FOREIGN KEY ("counterparty_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Step 5: Add index on counterparty_user_id
CREATE INDEX "order_reservations_counterparty_idx" ON "order_reservations" USING btree ("counterparty_user_id");--> statement-breakpoint

-- Step 6: Clear buy_order_id for existing reservations (sell order is the one being reserved from)
-- and make buy_order_id nullable
UPDATE "order_reservations" SET "buy_order_id" = NULL WHERE "sell_order_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "order_reservations" ALTER COLUMN "buy_order_id" DROP NOT NULL;--> statement-breakpoint

-- Step 7: Make sell_order_id nullable (for future "fill buy order" reservations)
ALTER TABLE "order_reservations" ALTER COLUMN "sell_order_id" DROP NOT NULL;
