import { Database, type DbError, type Executor, query } from '@arv/db';
import type { UserId } from '@arv/kernel';
import { and, asc, eq, inArray, not, notInArray, type SQL, sql } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import {
  AccessRoleId,
  type AccessRoleInput,
  type AccessRoleRecord,
  AccessRoleRepository,
} from '../application/ports';
import { type AccessRoleNameKey, accessRoleNameKey } from '../domain/access-role';
import { AccessRoleNameTaken } from '../domain/errors';
import { MANAGE_ACCESS } from '../permissions';
import { accessRolePermissions, accessRoles, userAccessRoles, users } from './schema';

const NAME_KEY_UNIQUE = 'access_roles_name_key_unique';
const ADMIN_ROLE_NAME = 'Admin';
/** Returned from inside a write when the name key is taken by another role. */
const NAME_TAKEN = Symbol('NAME_TAKEN');

/** The name key expression the unique index is built on (AC-10), so lookups can use the index. */
const nameKey = sql`lower(btrim(${accessRoles.name}))`;

// One row per role: its keys and distinct holders, aggregated over both join tables.
const recordFields = {
  id: accessRoles.id,
  name: accessRoles.name,
  isPreselected: accessRoles.isPreselected,
  createdAt: accessRoles.createdAt,
  permissionKeys: sql<
    string[]
  >`coalesce(array_agg(distinct ${accessRolePermissions.permissionKey}) filter (where ${accessRolePermissions.permissionKey} is not null), '{}')::text[]`,
  holderCount: sql<number>`count(distinct ${userAccessRoles.userId})::int`,
};

type RecordRow = {
  id: string;
  name: string;
  isPreselected: boolean;
  createdAt: Date;
  permissionKeys: string[];
  holderCount: number;
};

const toRecord = (row: RecordRow): AccessRoleRecord => ({
  ...row,
  id: AccessRoleId.make(row.id),
});

const selectRecords = (db: Executor, where?: SQL): Promise<RecordRow[]> =>
  db
    .select(recordFields)
    .from(accessRoles)
    .leftJoin(accessRolePermissions, eq(accessRolePermissions.accessRoleId, accessRoles.id))
    .leftJoin(userAccessRoles, eq(userAccessRoles.accessRoleId, accessRoles.id))
    .where(where)
    .groupBy(accessRoles.id)
    .orderBy(asc(accessRoles.createdAt), asc(accessRoles.id));

const selectOne = async (db: Executor, where: SQL) =>
  Option.fromNullable((await selectRecords(db, where))[0]).pipe(Option.map(toRecord));

/** Reads a role that this transaction just wrote; its absence is a defect. */
const selectWritten = async (db: Executor, id: string) => {
  const [row] = await selectRecords(db, eq(accessRoles.id, id));
  if (row === undefined) throw new Error(`access role ${id} vanished after write`);
  return toRecord(row);
};

/** Adds `keys` to the role, keeping the grants it already has (and their `created_at`). */
const grant = async (db: Executor, roleId: string, keys: ReadonlyArray<string>) => {
  if (keys.length === 0) return;
  await db
    .insert(accessRolePermissions)
    .values(keys.map((permissionKey) => ({ accessRoleId: roleId, permissionKey })))
    .onConflictDoNothing();
};

/** Users holding manage access through any of their roles, as a subquery of user ids. */
const manageAccessHolderIds = (db: Executor) =>
  db
    .selectDistinct({ userId: userAccessRoles.userId })
    .from(userAccessRoles)
    .innerJoin(
      accessRolePermissions,
      eq(accessRolePermissions.accessRoleId, userAccessRoles.accessRoleId),
    )
    .where(eq(accessRolePermissions.permissionKey, MANAGE_ACCESS));

/** Walks the error's `cause` chain (DbError → DrizzleQueryError → pg error) for a unique violation. */
const isUniqueViolation = (error: unknown, constraint: string): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint === constraint) return true;
    current = candidate.cause;
  }
  return false;
};

const uniqueKeys = (keys: ReadonlyArray<string>) => [...new Set(keys)];

export const DrizzleAccessRoleRepositoryLive = Layer.effect(
  AccessRoleRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    /**
     * Like `run`, for writes that can hit the name key (AC-10). A taken key is detected without
     * raising a Postgres error (a failed `pool.query` makes node-postgres end that socket, which
     * workerd reports as "socket has been closed"); the unique index stays the backstop for a
     * concurrent write, and its violation also becomes `AccessRoleNameTaken`.
     */
    const runNamed = <A>(
      name: string,
      effect: Effect.Effect<A | typeof NAME_TAKEN, DbError, Database>,
    ) =>
      effect.pipe(
        Effect.provideService(Database, database),
        Effect.catchAll((error) =>
          isUniqueViolation(error, NAME_KEY_UNIQUE)
            ? Effect.succeed(NAME_TAKEN)
            : Effect.die(error),
        ),
        Effect.flatMap((result) =>
          result === NAME_TAKEN
            ? Effect.fail(new AccessRoleNameTaken({ name }))
            : Effect.succeed(result as A),
        ),
      );

    // Multi-statement writes are not atomic on their own: like every adapter they join the
    // caller's `UnitOfWork.transactional` through `query()` (no `db.transaction` here, db.md).
    const create = (input: AccessRoleInput) =>
      runNamed(
        input.name,
        query(async (db) => {
          // No conflict target: the name key is the only unique index a new, unmarked row can hit.
          const [inserted] = await db
            .insert(accessRoles)
            .values({ name: input.name, isPreselected: false })
            .onConflictDoNothing()
            .returning({ id: accessRoles.id });
          if (inserted === undefined) return NAME_TAKEN;
          await grant(db, inserted.id, uniqueKeys(input.permissionKeys));
          return selectWritten(db, inserted.id);
        }),
      );

    const update = (id: AccessRoleId, input: AccessRoleInput) =>
      runNamed(
        input.name,
        query(async (db) => {
          const [current] = await db
            .select({ id: accessRoles.id })
            .from(accessRoles)
            .where(eq(accessRoles.id, id));
          if (current === undefined) return Option.none<AccessRoleRecord>();
          const [clash] = await db
            .select({ id: accessRoles.id })
            .from(accessRoles)
            .where(
              and(sql`${nameKey} = ${accessRoleNameKey(input.name)}`, not(eq(accessRoles.id, id))),
            );
          if (clash !== undefined) return NAME_TAKEN;
          await db.update(accessRoles).set({ name: input.name }).where(eq(accessRoles.id, id));
          // Replace the key set: drop what is no longer granted, add what is new.
          const keys = uniqueKeys(input.permissionKeys);
          await db
            .delete(accessRolePermissions)
            .where(
              and(
                eq(accessRolePermissions.accessRoleId, id),
                keys.length > 0 ? notInArray(accessRolePermissions.permissionKey, keys) : undefined,
              ),
            );
          await grant(db, id, keys);
          return Option.some(await selectWritten(db, id));
        }),
      );

    return {
      list: () =>
        run(query((db) => selectRecords(db)).pipe(Effect.map((rows) => rows.map(toRecord)))),
      findById: (id) => run(query((db) => selectOne(db, eq(accessRoles.id, id)))),
      findByNameKey: (key: AccessRoleNameKey) =>
        run(query((db) => selectOne(db, sql`${nameKey} = ${key}`))),
      listForUser: (userId: UserId) =>
        run(
          query((db) =>
            selectRecords(
              db,
              inArray(
                accessRoles.id,
                db
                  .select({ id: userAccessRoles.accessRoleId })
                  .from(userAccessRoles)
                  .where(eq(userAccessRoles.userId, userId)),
              ),
            ),
          ).pipe(Effect.map((rows) => rows.map(toRecord))),
        ),
      create,
      update,
      // Grants and assignments go by ON DELETE CASCADE, the pre-selected mark with the row (AC-11).
      delete: (id) =>
        run(
          query((db) =>
            db.delete(accessRoles).where(eq(accessRoles.id, id)).returning({ id: accessRoles.id }),
          ).pipe(Effect.map((rows) => rows.length > 0)),
        ),
      // Two statements, not one `SET is_preselected = (id = $1)`: the partial unique index is
      // checked row by row, so a single UPDATE fails whenever it reaches the new role before the
      // old one. Clearing first, then marking, keeps at most one mark at every step (AC-13).
      setPreselected: (id) =>
        run(
          query(async (db) => {
            await db
              .update(accessRoles)
              .set({ isPreselected: false })
              .where(
                id === null
                  ? eq(accessRoles.isPreselected, true)
                  : and(eq(accessRoles.isPreselected, true), not(eq(accessRoles.id, id))),
              );
            if (id !== null) {
              await db
                .update(accessRoles)
                .set({ isPreselected: true })
                .where(and(eq(accessRoles.id, id), eq(accessRoles.isPreselected, false)));
            }
          }),
        ),
      getPreselected: () => run(query((db) => selectOne(db, eq(accessRoles.isPreselected, true)))),
      countManageAccessHolders: () =>
        run(
          query((db) =>
            db
              .select({ count: sql<number>`count(distinct ${userAccessRoles.userId})::int` })
              .from(userAccessRoles)
              .innerJoin(
                accessRolePermissions,
                eq(accessRolePermissions.accessRoleId, userAccessRoles.accessRoleId),
              )
              .where(eq(accessRolePermissions.permissionKey, MANAGE_ACCESS)),
          ).pipe(Effect.map((rows) => rows[0]?.count ?? 0)),
        ),
      listAdmins: () =>
        run(
          query((db) =>
            db
              .select({ name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, manageAccessHolderIds(db)))
              .orderBy(asc(users.name), asc(users.email)),
          ),
        ),
      ensureAdminRole: () =>
        run(
          query(async (db) => {
            const adminKey = accessRoleNameKey(ADMIN_ROLE_NAME);
            // A concurrent bootstrap may insert it first: the conflict is ignored, then re-read.
            await db
              .insert(accessRoles)
              .values({ name: ADMIN_ROLE_NAME, isPreselected: false })
              .onConflictDoNothing();
            const [role] = await db
              .select({ id: accessRoles.id })
              .from(accessRoles)
              .where(sql`${nameKey} = ${adminKey}`);
            if (role === undefined) throw new Error('admin access role missing after upsert');
            await grant(db, role.id, [MANAGE_ACCESS]);
            return selectWritten(db, role.id);
          }),
        ),
    };
  }),
);
