import type { ApiErrorBody, Conflict, NotFound } from '@arv/contracts';
import type { DbError } from '@arv/db';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Every expected (typed) failure a handler may produce. */
export type AppError = NotFound | Conflict | DbError;

export const errorBody = (_tag: string, message: string): ApiErrorBody => ({
  error: { _tag, message },
});

export function toHttpError(error: AppError): { status: ContentfulStatusCode; body: ApiErrorBody } {
  switch (error._tag) {
    case 'NotFound':
      return { status: 404, body: errorBody(error._tag, error.message) };
    case 'Conflict':
      return { status: 409, body: errorBody(error._tag, error.message) };
    case 'DbError':
      console.error('DbError', error.cause);
      return { status: 500, body: errorBody('InternalError', 'Internal server error') };
  }
}
