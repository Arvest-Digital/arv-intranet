import { Cause, Effect, Exit, type Layer, Option } from 'effect';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  type AccessError,
  type ContractError,
  errorBody,
  toContractError,
  toHttpError,
} from './errors';

/**
 * Hono env every module router uses. The host puts the per-request app Layer in `appLayer`;
 * modules never import the host. `Layer<never>` accepts any Layer (its output is contravariant).
 */
export type HttpEnv = {
  Variables: {
    appLayer: Layer.Layer<never>;
  };
};

/**
 * Runs a handler Effect with the per-request app Layer and turns the result into a JSON response:
 * success → `status`, contract error → mapped status (see `toHttpError`), defect → 500.
 * The kernel's access errors (`PermissionDenied` → 403 `Forbidden`, `Unauthenticated` → 401) are
 * mapped here once, so presenters never see them (ADR-0005).
 * The success value must already be wire-encoded (e.g. via `Schema.encode`).
 *
 * The app Layer is composed in the host, so `R` can't be checked here: a service missing from
 * `apps/api/src/composition.ts` is a defect (500) at run time.
 */
export async function runEffect<A, R, S extends ContentfulStatusCode = 200>(
  c: Context<HttpEnv>,
  effect: Effect.Effect<A, ContractError | AccessError, R>,
  status?: S,
) {
  const appLayer = c.get('appLayer') as Layer.Layer<R>;
  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.mapError(toContractError), Effect.provide(appLayer)),
  );

  if (Exit.isSuccess(exit)) {
    return c.json(exit.value, status ?? (200 as S));
  }

  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) {
    const { status: errorStatus, body } = toHttpError(failure.value);
    return c.json(body, errorStatus);
  }

  console.error(Cause.pretty(exit.cause));
  return c.json(
    errorBody('InternalError', 'platform.internal_error', 'Internal server error'),
    500,
  );
}
