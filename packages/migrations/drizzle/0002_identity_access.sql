CREATE TABLE "identity"."access_role_permissions" (
	"access_role_id" uuid NOT NULL,
	"permission_key" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_role_permissions_access_role_id_permission_key_pk" PRIMARY KEY("access_role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "identity"."access_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_preselected" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_reason" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."user_access_roles" (
	"user_id" uuid NOT NULL,
	"access_role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_access_roles_user_id_access_role_id_pk" PRIMARY KEY("user_id","access_role_id")
);
--> statement-breakpoint
ALTER TABLE "identity"."access_role_permissions" ADD CONSTRAINT "access_role_permissions_access_role_id_access_roles_id_fk" FOREIGN KEY ("access_role_id") REFERENCES "identity"."access_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_access_roles" ADD CONSTRAINT "user_access_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_access_roles" ADD CONSTRAINT "user_access_roles_access_role_id_access_roles_id_fk" FOREIGN KEY ("access_role_id") REFERENCES "identity"."access_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_role_permissions_permission_key" ON "identity"."access_role_permissions" USING btree ("permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "access_roles_name_key_unique" ON "identity"."access_roles" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "access_roles_one_preselected_unique" ON "identity"."access_roles" USING btree ((true)) WHERE "identity"."access_roles"."is_preselected";--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "identity"."sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "identity"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires_at" ON "identity"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_access_roles_access_role_id" ON "identity"."user_access_roles" USING btree ("access_role_id");