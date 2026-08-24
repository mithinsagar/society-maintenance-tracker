CREATE TYPE "public"."complaint_category" AS ENUM('PLUMBING', 'ELECTRICAL', 'CLEANING', 'SECURITY', 'ELEVATOR', 'WATER_SUPPLY', 'COMMON_AREA', 'PARKING', 'NOISE', 'PEST_CONTROL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."complaint_event_type" AS ENUM('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."email_type" AS ENUM('COMPLAINT_STATUS_CHANGED', 'IMPORTANT_NOTICE');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('RESIDENT', 'ADMIN');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"society_name" varchar(120) DEFAULT 'Greenwood Heights' NOT NULL,
	"overdue_threshold_days" integer DEFAULT 7 NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton_check" CHECK ("app_settings"."id" = 1),
	CONSTRAINT "app_settings_threshold_range_check" CHECK ("app_settings"."overdue_threshold_days" BETWEEN 1 AND 365)
);
--> statement-breakpoint
CREATE TABLE "complaint_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"type" "complaint_event_type" NOT NULL,
	"from_status" "complaint_status",
	"to_status" "complaint_status",
	"from_priority" "priority",
	"to_priority" "priority",
	"note" text,
	"actor_id" uuid NOT NULL,
	"actor_role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaint_events_payload_check" CHECK (
        ("complaint_events"."type" = 'CREATED'
           AND "complaint_events"."to_status" IS NOT NULL
           AND "complaint_events"."from_status" IS NULL)
        OR ("complaint_events"."type" = 'STATUS_CHANGED'
           AND "complaint_events"."from_status" IS NOT NULL
           AND "complaint_events"."to_status" IS NOT NULL)
        OR ("complaint_events"."type" = 'PRIORITY_CHANGED'
           AND "complaint_events"."from_priority" IS NOT NULL
           AND "complaint_events"."to_priority" IS NOT NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(20) DEFAULT 'CMP-' || lpad(nextval('complaint_reference_seq')::text, 6, '0') NOT NULL,
	"resident_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"category" "complaint_category" NOT NULL,
	"status" "complaint_status" DEFAULT 'OPEN' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"photo_url" text,
	"photo_public_id" text,
	"photo_width" integer,
	"photo_height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "complaints_reference_unique" UNIQUE("reference"),
	CONSTRAINT "complaints_resolved_at_consistency_check" CHECK (("complaints"."status" = 'RESOLVED') = ("complaints"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_email" varchar(255) NOT NULL,
	"recipient_name" varchar(120),
	"type" "email_type" NOT NULL,
	"subject" text NOT NULL,
	"status" "email_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"complaint_id" uuid,
	"notice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"is_important" boolean DEFAULT false NOT NULL,
	"author_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"flat_number" varchar(20) NOT NULL,
	"phone" varchar(20),
	"role" "role" DEFAULT 'RESIDENT' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resident_id_users_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaint_events_complaint_created_idx" ON "complaint_events" USING btree ("complaint_id","created_at");--> statement-breakpoint
CREATE INDEX "complaint_events_actor_idx" ON "complaint_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "complaint_events_created_at_idx" ON "complaint_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "complaints_resident_created_idx" ON "complaints" USING btree ("resident_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "complaints_status_created_idx" ON "complaints" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "complaints_category_idx" ON "complaints" USING btree ("category");--> statement-breakpoint
CREATE INDEX "complaints_priority_created_idx" ON "complaints" USING btree ("priority","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "complaints_created_at_idx" ON "complaints" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_outbox_status_created_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_created_at_idx" ON "email_outbox" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notices_important_published_idx" ON "notices" USING btree ("is_important" DESC NULLS LAST,"published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notices_archived_at_idx" ON "notices" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_role_is_active_idx" ON "users" USING btree ("role","is_active");