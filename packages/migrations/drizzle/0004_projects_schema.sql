CREATE TABLE "projects"."projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(16) NOT NULL,
	"close_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_projects_name_key" ON "projects"."projects" USING btree (lower(btrim("name")));