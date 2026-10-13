import { Cause, Effect, Exit, Option } from 'effect';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from '../env';
import { type AppServices, makeAppLayer } from '../layers';
import { type AppError, errorBody, toHttpError } from './errors';

/**
 * Runs a handler Effect with the per-request app Layer and turns the result into a JSON response:
 * success → `status`, typed failure → mapped status (see `toHttpError`), defect → 500.
 * The success value must already be wire-encoded (e.g. via `Schema.encode`).
 */
export async function runEffect<A, S extends ContentfulStatusCode = 200>(
  c: Context<AppEnv>,
  effect: Effect.Effect<A, AppError, AppServices>,
  status?: S,
) {
  const exit = await Effect.runPromiseExit(effect.pipe(Effect.provide(makeAppLayer(c.env))));

  if (Exit.isSuccess(exit)) {
    return c.json(exit.value, status ?? (200 as S));
  }

  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) {
    const { status: errorStatus, body } = toHttpError(failure.value);
    return c.json(body, errorStatus);
  }

  console.error(Cause.pretty(exit.cause));
  return c.json(errorBody('InternalError', 'Internal server error'), 500);
}
