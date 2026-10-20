import type { ApiErrorBody, Conflict, NotFound } from '@arv/contracts/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Every expected failure a route may produce. Modules map their domain errors to these in their
 * presenter; infrastructure failures are defects and never appear here.
 */
export type ContractError = NotFound | Conflict;

export const errorBody = (_tag: string, message: string): ApiErrorBody => ({
  error: { _tag, message },
});

export function toHttpError(error: ContractError): {
  status: ContentfulStatusCode;
  body: ApiErrorBody;
} {
  switch (error._tag) {
    case 'NotFound':
      return { status: 404, body: errorBody(error._tag, error.message) };
    case 'Conflict':
      return { status: 409, body: errorBody(error._tag, error.message) };
  }
}
