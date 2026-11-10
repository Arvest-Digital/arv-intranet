import {
  type ApiErrorBody,
  type ApiErrorTag,
  type Conflict,
  Forbidden,
  type NotFound,
  type Refused,
  Unauthenticated,
} from '@arv/contracts/shared';
import type { PermissionDenied, Unauthenticated as UnauthenticatedActor } from '@arv/kernel';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Every expected failure a route may produce. Modules map their domain errors to these in their
 * presenter; infrastructure failures are defects and never appear here.
 */
export type ContractError = NotFound | Conflict | Unauthenticated | Forbidden | Refused;

/** The kernel's access-check failures (`requirePermission`). `runEffect` maps them, not presenters. */
export type AccessError = PermissionDenied | UnauthenticatedActor;

export const errorBody = (
  _tag: ApiErrorTag,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorBody => ({
  error: details === undefined ? { _tag, code, message } : { _tag, code, message, details },
});

/**
 * The one mapping of kernel access errors to contract errors (ADR-0005); contract errors pass
 * through. The kernel's and the contract's `Unauthenticated` share a `_tag`, so they are told
 * apart by class.
 */
export function toContractError(error: ContractError | AccessError): ContractError {
  switch (error._tag) {
    case 'PermissionDenied':
      return new Forbidden({ permission: error.permission });
    case 'Unauthenticated':
      return error instanceof Unauthenticated
        ? error
        : new Unauthenticated(error.reason ? { reason: error.reason } : {});
    default:
      return error;
  }
}

/** `identity:manage-access` → `identity.missing_permission`. */
const missingPermissionCode = (permission: string) =>
  `${(permission.split(':')[0] ?? 'platform').replaceAll('-', '_')}.missing_permission`;

export function toHttpError(error: ContractError): {
  status: ContentfulStatusCode;
  body: ApiErrorBody;
} {
  switch (error._tag) {
    case 'NotFound':
      return {
        status: 404,
        body: errorBody(error._tag, error.code ?? 'platform.not_found', error.message),
      };
    case 'Conflict':
      return {
        status: 409,
        body: errorBody(error._tag, error.code, error.message, error.details),
      };
    case 'Unauthenticated':
      return {
        status: 401,
        body: errorBody(
          error._tag,
          error.reason === 'access-removed'
            ? 'identity.access_removed'
            : 'platform.unauthenticated',
          error.message,
        ),
      };
    case 'Refused':
      return {
        status: 403,
        body: errorBody('Forbidden', error.code, error.message, error.details),
      };
    case 'Forbidden':
      return {
        status: 403,
        body: errorBody(error._tag, missingPermissionCode(error.permission), error.message, {
          missingPermissions: [error.permission],
        }),
      };
  }
}
