CREATE TABLE "channel_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" varchar(30) NOT NULL,
	"key" varchar(50) NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_config_channel_key_idx" ON "channel_config" USING btree ("channel_id","key");--> statement-breakpoint
CREATE INDEX "channel_config_channel_idx" ON "channel_config" USING btree ("channel_id");