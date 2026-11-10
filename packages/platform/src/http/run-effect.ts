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

/** Runs `effect` with the request's app Layer, contract-mapping its failures. */
const runWithAppLayer = <A, R>(
  c: Context<HttpEnv>,
  effect: Effect.Effect<A, ContractError | AccessError, R>,
) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.mapError(toContractError),
      Effect.provide(c.get('appLayer') as Layer.Layer<R>),
    ),
  );

/** Contract error → mapped status (see `toHttpError`), defect → 500. */
const failureResponse = (c: Context<HttpEnv>, cause: Cause.Cause<ContractError>) => {
  const failure = Cause.failureOption(cause);
  if (Option.isSome(failure)) {
    const { status, body } = toHttpError(failure.value);
    return c.json(body, status);
  }

  console.error(Cause.pretty(cause));
  return c.json(
    errorBody('InternalError', 'platform.internal_error', 'Internal server error'),
    500,
  );
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
  const exit = await runWithAppLayer(c, effect);
  if (Exit.isSuccess(exit)) return c.json(exit.value, status ?? (200 as S));
  return failureResponse(c, exit.cause);
}

/** Like `runEffect`, but success answers 204 with no body (the success value is ignored). */
export async function runEffectNoContent<R>(
  c: Context<HttpEnv>,
  effect: Effect.Effect<unknown, ContractError | AccessError, R>,
) {
  const exit = await runWithAppLayer(c, effect);
  if (Exit.isSuccess(exit)) return c.body(null, 204);
  return failureResponse(c, exit.cause);
}
