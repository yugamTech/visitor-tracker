CREATE TYPE "public"."pass_type" AS ENUM('single_use', 'date_range', 'weekdays', 'time_window');--> statement-breakpoint
CREATE TYPE "public"."request_source" AS ENUM('public_form', 'guard', 'pass');--> statement-breakpoint
CREATE TYPE "public"."routing_type" AS ENUM('group', 'user', 'auto_pass');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('guard', 'admin', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('pending', 'asked_to_wait', 'approved', 'rejected', 'checked_in', 'checked_out', 'expired');--> statement-breakpoint
CREATE TABLE "access_passes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"code" varchar(16) NOT NULL,
	"visitor_name" varchar(256) NOT NULL,
	"visitor_phone" varchar(20) NOT NULL,
	"purpose" text,
	"pass_type" "pass_type" NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"days_of_week" jsonb,
	"daily_start_time" varchar(5),
	"daily_end_time" varchar(5),
	"uses_allowed" bigint,
	"uses_consumed" bigint DEFAULT 0 NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" bigint,
	"issued_by_user_id" bigint NOT NULL,
	"notify_admin_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"actor_user_id" bigint,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" bigint NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(256) NOT NULL,
	"body" text,
	"related_entity_type" varchar(32),
	"related_entity_id" bigint,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"tenant_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"group_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_groups_user_id_group_id_pk" PRIMARY KEY("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"email" varchar(320),
	"phone" varchar(20),
	"name" varchar(256) NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"code" varchar(12) NOT NULL,
	"visitor_name" varchar(256) NOT NULL,
	"visitor_phone" varchar(20) NOT NULL,
	"visitor_email" varchar(320),
	"purpose" text NOT NULL,
	"visit_type_id" bigint,
	"host_name" varchar(256),
	"host_user_id" bigint,
	"routing_type" "routing_type" NOT NULL,
	"routed_group_id" bigint,
	"routed_user_id" bigint,
	"routing_snapshot" jsonb NOT NULL,
	"status" "visit_status" DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" bigint,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"has_parcel" boolean DEFAULT false NOT NULL,
	"parcel_note" text,
	"source" "request_source" NOT NULL,
	"created_by_user_id" bigint,
	"access_pass_id" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_types" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"default_routing_type" "routing_type",
	"default_group_id" bigint,
	"default_user_id" bigint,
	"required_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"request_id" bigint NOT NULL,
	"photo_url" text,
	"badge_number" varchar(32) NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_by_user_id" bigint NOT NULL,
	"checked_out_at" timestamp with time zone,
	"checked_out_by_user_id" bigint
);
--> statement-breakpoint
ALTER TABLE "access_passes" ADD CONSTRAINT "access_passes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_passes" ADD CONSTRAINT "access_passes_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_passes" ADD CONSTRAINT "access_passes_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_groups" ADD CONSTRAINT "admin_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_id_admin_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."admin_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_visit_type_id_visit_types_id_fk" FOREIGN KEY ("visit_type_id") REFERENCES "public"."visit_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_routed_group_id_admin_groups_id_fk" FOREIGN KEY ("routed_group_id") REFERENCES "public"."admin_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_routed_user_id_users_id_fk" FOREIGN KEY ("routed_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_access_pass_id_access_passes_id_fk" FOREIGN KEY ("access_pass_id") REFERENCES "public"."access_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_types" ADD CONSTRAINT "visit_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_types" ADD CONSTRAINT "visit_types_default_group_id_admin_groups_id_fk" FOREIGN KEY ("default_group_id") REFERENCES "public"."admin_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_types" ADD CONSTRAINT "visit_types_default_user_id_users_id_fk" FOREIGN KEY ("default_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_request_id_visit_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."visit_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_checked_in_by_user_id_users_id_fk" FOREIGN KEY ("checked_in_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_checked_out_by_user_id_users_id_fk" FOREIGN KEY ("checked_out_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_passes_tenant_code_idx" ON "access_passes" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "access_passes_tenant_active_idx" ON "access_passes" USING btree ("tenant_id","is_revoked","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_groups_tenant_slug_idx" ON "admin_groups" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_entity_idx" ON "audit_log" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_created_idx" ON "audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_user_created_idx" ON "notifications" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_user_unread_idx" ON "notifications" USING btree ("tenant_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "user_groups_tenant_idx" ON "user_groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "user_groups_group_idx" ON "user_groups" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_idx" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "users_tenant_phone_idx" ON "users" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "users_tenant_role_idx" ON "users" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "visit_requests_tenant_code_idx" ON "visit_requests" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "visit_requests_tenant_status_idx" ON "visit_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "visit_requests_tenant_routed_user_idx" ON "visit_requests" USING btree ("tenant_id","routed_user_id","status");--> statement-breakpoint
CREATE INDEX "visit_requests_tenant_routed_group_idx" ON "visit_requests" USING btree ("tenant_id","routed_group_id","status");--> statement-breakpoint
CREATE INDEX "visit_requests_tenant_created_idx" ON "visit_requests" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visit_types_tenant_slug_idx" ON "visit_types" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "visit_types_tenant_active_idx" ON "visit_types" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_tenant_badge_idx" ON "visits" USING btree ("tenant_id","badge_number");--> statement-breakpoint
CREATE INDEX "visits_tenant_checked_in_idx" ON "visits" USING btree ("tenant_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "visits_tenant_open_idx" ON "visits" USING btree ("tenant_id","checked_out_at");