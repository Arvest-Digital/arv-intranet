import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const identity = pgSchema('identity');

export const users = identity.table('users', {
  // uuidv7() (Postgres 18+): time-ordered, so new rows append to the end of the PK index.
  id: uuid().primaryKey().default(sql`uuidv7()`),
  email: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Server-side sign-in sessions (ADR-0003). Only the token's hash is stored.
export const sessions = identity.table(
  'sessions',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    tokenHash: varchar({ length: 64 }).notNull(),
    // Nullable on purpose: a removed user's revoked sessions survive so the next request can say "access removed" (AC-07).
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedReason: varchar({ length: 32 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_unique').on(t.tokenHash),
    index('idx_sessions_user_id').on(t.userId),
    // Lazy purge at sign-in: delete sessions that expired before now.
    index('idx_sessions_expires_at').on(t.expiresAt),
  ],
);

export const accessRoles = identity.table(
  'access_roles',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    name: varchar({ length: 100 }).notNull(),
    // No DB default: the app writes false on insert.
    isPreselected: boolean().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // AC-10: role names are unique ignoring letter case and surrounding spaces.
    uniqueIndex('access_roles_name_key_unique').on(sql`lower(btrim(${t.name}))`),
    // AC-13: at most one role is pre-selected for new people.
    uniqueIndex('access_roles_one_preselected_unique')
      .on(sql`(true)`)
      .where(sql`${t.isPreselected}`),
  ],
);

export const accessRolePermissions = identity.table(
  'access_role_permissions',
  {
    accessRoleId: uuid()
      .notNull()
      .references(() => accessRoles.id, { onDelete: 'cascade' }),
    // Key from the code-declared catalog (ADR-0004), e.g. identity:manage-access. Not an FK; undeclared = retired.
    permissionKey: varchar({ length: 100 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // access_role_id leads: the PK is also the FK index.
    primaryKey({ columns: [t.accessRoleId, t.permissionKey] }),
    index('idx_access_role_permissions_permission_key').on(t.permissionKey),
  ],
);

export const userAccessRoles = identity.table(
  'user_access_roles',
  {
    // AC-07: a removed user's assignments go with them.
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // AC-11: deleting a role ends every holder's assignment.
    accessRoleId: uuid()
      .notNull()
      .references(() => accessRoles.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // user_id leads: the PK is also the user_id FK index.
    primaryKey({ columns: [t.userId, t.accessRoleId] }),
    index('idx_user_access_roles_access_role_id').on(t.accessRoleId),
  ],
);
