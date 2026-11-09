import { Actor, Unauthenticated } from '@arv/kernel';
import { Clock, Effect, Option } from 'effect';
import { hashSessionToken, SessionValidity, sessionValidity } from '../domain/session';
import { PermissionCatalog, SessionRepository } from './ports';

/**
 * Builds the request's actor from its session token (sad §6 Critical flow 2, ADR-0005).
 *
 * - No token, an unknown token or an expired session → `Anonymous`.
 * - A revoked session → fails `Unauthenticated { reason: 'access-removed' }` (AC-07).
 * - An active session → `Actor.User` holding the granted keys a module still declares
 *   (AC-16, AC-18); manage access grants nothing beyond itself (AC-19).
 *
 * Runs on every request with no cache of any kind, so a role change applies from the next
 * request (AC-17). A repository failure stays a defect and never becomes `Anonymous` (QG-1).
 */
export const resolveActor = (
  token: Option.Option<string>,
): Effect.Effect<Actor, Unauthenticated, SessionRepository | PermissionCatalog> =>
  Option.match(token, {
    onNone: () => Effect.succeed(Actor.Anonymous()),
    onSome: (raw) =>
      Effect.gen(function* () {
        const sessions = yield* SessionRepository;
        const catalog = yield* PermissionCatalog;
        const stored = Option.getOrUndefined(yield* sessions.resolve(yield* hashSessionToken(raw)));
        const now = new Date(yield* Clock.currentTimeMillis);

        return yield* SessionValidity.$match(sessionValidity(stored, now), {
          Unknown: () => Effect.succeed(Actor.Anonymous()),
          Expired: () => Effect.succeed(Actor.Anonymous()),
          Revoked: ({ reason }) => Effect.fail(new Unauthenticated({ reason })),
          Active: () => {
            // An active row always has its user (removal revokes first); grant nothing otherwise.
            if (stored === undefined || stored.userId === null) {
              return Effect.succeed(Actor.Anonymous());
            }
            const granted = new Set(stored.grantedKeys);
            // Keys come from the catalog, not from the row: an undeclared key never gets in.
            const permissions = new Set(
              catalog
                .declarations()
                .map((declaration) => declaration.key)
                .filter((key) => granted.has(key)),
            );
            return Effect.succeed(Actor.User({ id: stored.userId, permissions }));
          },
        });
      }),
  });
