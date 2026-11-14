import { connectDatabase, Database } from '@arv/db';
import { IdentityApi } from '@arv/identity';
import { Actor, Unauthenticated } from '@arv/kernel';
import { toContractError, toHttpError } from '@arv/platform/http';
import { Cause, Effect, Exit, type Layer, Option } from 'effect';
import { createMiddleware } from 'hono/factory';
import { makeIdentityLayer } from '../composition';
import type { AppEnv, Bindings } from '../env';
import { requestDatabase } from './request-database';

/**
 * Routes that need no session (sad §8 Authentication), as `METHOD path`. Every other route,
 * mounted or not, is denied to an anonymous caller.
 */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  'GET /health',
  'POST /identity/sign-in/begin',
  'POST /identity/sign-in/complete',
]);

export const isPublicRoute = (method: string, path: string) =>
  PUBLIC_ROUTES.has(`${method.toUpperCase()} ${path}`);

const bearerToken = (header: string | undefined) =>
  Option.fromNullable(header).pipe(
    Option.filter((value) => value.startsWith('Bearer ')),
    Option.map((value) => value.slice('Bearer '.length)),
  );

/**
 * Resolves the request's actor through the identity module and stores it as `actor`, on every
 * request with no cache (ADR-0005).
 *
 * - Public routes skip the check and run as `Anonymous`.
 * - No, unknown or expired session → 401 `platform.unauthenticated`.
 * - Revoked session → 401 `identity.access_removed` (AC-07).
 * - A failure to resolve is a defect and reaches the host's 500, never `Anonymous` (QG-1).
 *
 * Logs `accessCheckMs` and, within it, `dbConnectMs` (no personal data) and answers them as
 * `Server-Timing: accessCheck;dur=…, dbConnect;dur=…` (sad §7 Monitoring). `dbConnectMs` is the
 * request's Postgres connection, opened first when there is a token; the request's work reuses
 * it. `accessCheckMs − dbConnectMs` is the check itself (T28).
 *
 * `identityLayer` defaults to the host's composition, over the request's one Database
 * (`requestDatabase`), which the app Layer reuses. Tests pass their own (a stand-in catalog,
 * a failing database) to run this same middleware against it.
 */
export const authenticate = (
  identityLayer: (
    env: Bindings,
    database: Layer.Layer<Database>,
  ) => Layer.Layer<IdentityApi> = makeIdentityLayer,
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (isPublicRoute(c.req.method, c.req.path)) {
      c.set('actor', Actor.Anonymous());
      await next();
      return;
    }

    const token = bearerToken(c.req.header('authorization'));
    const database = requestDatabase(c);
    const startedAt = performance.now();
    let connectedAt = startedAt;
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        // Connect up front, so the connection is timed apart from the check. Without a token
        // nothing is queried, so nothing connects. A failure is a defect, as in the check (QG-1).
        if (Option.isSome(token)) {
          yield* Effect.flatMap(Database, connectDatabase).pipe(
            Effect.provide(database),
            Effect.orDie,
          );
        }
        connectedAt = performance.now();
        return yield* Effect.flatMap(IdentityApi, (identity) => identity.resolveActor(token)).pipe(
          Effect.provide(identityLayer(c.env, database)),
        );
      }),
    );
    const accessCheckMs = roundMs(performance.now() - startedAt);
    const dbConnectMs = roundMs(connectedAt - startedAt);
    console.log(JSON.stringify({ event: 'api.access_check', accessCheckMs, dbConnectMs }));
    const serverTiming = `accessCheck;dur=${accessCheckMs}, dbConnect;dur=${dbConnectMs}`;

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      if (Option.isNone(failure)) throw Cause.squash(exit.cause);
      return unauthenticated(failure.value, serverTiming);
    }
    if (exit.value._tag === 'Anonymous') {
      return unauthenticated(new Unauthenticated({}), serverTiming);
    }

    c.set('actor', exit.value);
    await next();
    c.res.headers.append('Server-Timing', serverTiming);
  });

const roundMs = (ms: number) => Math.round(ms * 100) / 100;

const unauthenticated = (error: Unauthenticated, serverTiming: string) => {
  const { status, body } = toHttpError(toContractError(error));
  return Response.json(body, { status, headers: { 'Server-Timing': serverTiming } });
};
