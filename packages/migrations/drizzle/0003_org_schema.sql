CREATE SCHEMA "org";
--> statement-breakpoint
CREATE SCHEMA "projects";
--> statement-breakpoint
CREATE SCHEMA "scheduling";
--> statement-breakpoint
CREATE TABLE "org"."employee_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"contract_minutes" integer,
	"working_days" smallint[] NOT NULL,
	"employment_start" date,
	"employment_end" date,
	"version" integer NOT NULL,
	"last_changed_by" uuid NOT NULL,
	"last_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."public_holidays" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"holiday_date" date NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."teams" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" varchar(100) NOT NULL,
	"team_lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org"."employee_records" ADD CONSTRAINT "employee_records_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "org"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org"."teams" ADD CONSTRAINT "teams_team_lead_id_employee_records_id_fk" FOREIGN KEY ("team_lead_id") REFERENCES "org"."employee_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_records_user_id_unique" ON "org"."employee_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_employee_records_team_id" ON "org"."employee_records" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_holidays_holiday_date_unique" ON "org"."public_holidays" USING btree ("holiday_date");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_key_unique" ON "org"."teams" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "idx_teams_team_lead_id" ON "org"."teams" USING btree ("team_lead_id");