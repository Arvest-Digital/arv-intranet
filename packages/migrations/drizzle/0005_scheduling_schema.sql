CREATE TABLE "scheduling"."allocation_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"change_kind" varchar(16) NOT NULL,
	"effective_from" date,
	"before_values" jsonb,
	"after_values" jsonb,
	"changed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling"."allocation_segments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"rate_minutes" integer,
	"rate_period" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling"."allocations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"last_changed_by" uuid NOT NULL,
	"last_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling"."import_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"imported_by" uuid NOT NULL,
	"employee_records_created" integer NOT NULL,
	"projects_created" integer NOT NULL,
	"allocations_created" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduling"."allocation_segments" ADD CONSTRAINT "allocation_segments_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "scheduling"."allocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_allocation_history_allocation_id_created_at" ON "scheduling"."allocation_history" USING btree ("allocation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_allocation_history_created_at" ON "scheduling"."allocation_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_allocation_segments_allocation_id" ON "scheduling"."allocation_segments" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "idx_allocation_segments_ends_on_starts_on" ON "scheduling"."allocation_segments" USING btree ("ends_on","starts_on");--> statement-breakpoint
CREATE INDEX "idx_allocations_employee_id" ON "scheduling"."allocations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_allocations_project_id" ON "scheduling"."allocations" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_runs_one_time_unique" ON "scheduling"."import_runs" USING btree ((true));