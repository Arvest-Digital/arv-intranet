import { Database, type DbError, query } from '@arv/db';
import { UserId } from '@arv/kernel';
import { eq, lte, sql } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { type ResolvedSession, SessionRepository } from '../application/ports';
import type { RevocationReason } from '../domain/session';
import { accessRolePermissions, sessions, userAccessRoles } from './schema';

const REVOCATION_REASONS: ReadonlyArray<RevocationReason> = ['access-removed'];

/** A stored reason the domain doesn't know is a defect: fail closed rather than guess. */
const toRevocationReason = (stored: string | null): Effect.Effect<RevocationReason | null> => {
  if (stored === null) return Effect.succeed(null);
  const reason = REVOCATION_REASONS.find((known) => known === stored);
  return reason === undefined
    ? Effect.dieMessage(`identity.sessions: unknown revoked_reason ${stored}`)
    : Effect.succeed(reason);
};

export const DrizzleSessionRepositoryLive = Layer.effect(
  SessionRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    return {
      create: ({ tokenHash, userId, expiresAt }) =>
        run(query((db) => db.insert(sessions).values({ tokenHash, userId, expiresAt }))).pipe(
          Effect.asVoid,
        ),

      // One round-trip (QG-2): session by token_hash → assignments by user_id → grants by
      // access_role_id, every hop an index lookup. A removed user's row has user_id NULL, so the
      // LEFT JOINs find nothing and it grants no keys. Retired keys are returned too; the
      // caller filters them against the catalog (AC-16).
      resolve: (tokenHash) =>
        run(
          query((db) =>
            db
              .select({
                userId: sessions.userId,
                expiresAt: sessions.expiresAt,
                revokedReason: sessions.revokedReason,
                grantedKeys: sql<string[]>`coalesce(
                  array_agg(distinct ${accessRolePermissions.permissionKey})
                    filter (where ${accessRolePermissions.permissionKey} is not null),
                  '{}'
                )`,
              })
              .from(sessions)
              .leftJoin(userAccessRoles, eq(userAccessRoles.userId, sessions.userId))
              .leftJoin(
                accessRolePermissions,
                eq(accessRolePermissions.accessRoleId, userAccessRoles.accessRoleId),
              )
              .where(eq(sessions.tokenHash, tokenHash))
              .groupBy(sessions.id),
          ),
        ).pipe(
          Effect.flatMap(([row]) =>
            row === undefined
              ? Effect.succeed(Option.none<ResolvedSession>())
              : Effect.map(toRevocationReason(row.revokedReason), (revokedReason) =>
                  Option.some<ResolvedSession>({
                    userId: row.userId === null ? null : UserId.make(row.userId),
                    expiresAt: row.expiresAt,
                    revokedReason,
                    grantedKeys: row.grantedKeys,
                  }),
                ),
          ),
        ),

      deleteByHash: (tokenHash) =>
        run(
          query((db) =>
            db
              .delete(sessions)
              .where(eq(sessions.tokenHash, tokenHash))
              .returning({ id: sessions.id }),
          ),
        ).pipe(Effect.map((rows) => rows.length > 0)),

      // Rows are kept (not deleted) so the next request can say why (AC-07).
      revokeAllForUser: (userId, reason) =>
        run(
          query((db) =>
            db.update(sessions).set({ revokedReason: reason }).where(eq(sessions.userId, userId)),
          ),
        ).pipe(Effect.asVoid),

      // Expiry is exclusive (`sessionValidity`): a session is expired at exactly `expires_at`.
      purgeExpired: () =>
        run(query((db) => db.delete(sessions).where(lte(sessions.expiresAt, sql`now()`)))).pipe(
          Effect.asVoid,
        ),
    };
  }),
);
