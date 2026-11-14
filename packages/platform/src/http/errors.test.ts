import {
  ApiErrorBody,
  Conflict,
  Forbidden,
  Invalid,
  NotFound,
  Unauthenticated,
} from '@arv/contracts/shared';
import { Permission, PermissionDenied, Unauthenticated as UnauthenticatedActor } from '@arv/kernel';
import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { toContractError, toHttpError } from './errors';

const decode = Schema.decodeUnknownEither(ApiErrorBody);

/** Asserts the body is a valid `ApiErrorBody` and returns its `error`. */
const decoded = (body: unknown) => {
  const result = decode(body);
  if (Either.isLeft(result)) throw new Error(String(result.left));
  return result.right.error;
};

describe('toHttpError', () => {
  it('maps Unauthenticated to 401 platform.unauthenticated', () => {
    const { status, body } = toHttpError(new Unauthenticated({}));
    expect(status).toBe(401);
    expect(decoded(body)).toEqual({
      _tag: 'Unauthenticated',
      code: 'platform.unauthenticated',
      message: 'Sign in to continue',
    });
  });

  it("maps Unauthenticated { reason: 'access-removed' } to 401 identity.access_removed", () => {
    const { status, body } = toHttpError(new Unauthenticated({ reason: 'access-removed' }));
    expect(status).toBe(401);
    expect(decoded(body)).toEqual({
      _tag: 'Unauthenticated',
      code: 'identity.access_removed',
      message: 'You no longer have access to the intranet',
    });
  });

  it('maps Forbidden to 403 <module>.missing_permission naming the permission', () => {
    const { status, body } = toHttpError(new Forbidden({ permission: 'identity:manage-access' }));
    expect(status).toBe(403);
    expect(decoded(body)).toMatchObject({
      _tag: 'Forbidden',
      code: 'identity.missing_permission',
      details: { missingPermissions: ['identity:manage-access'] },
    });
  });

  it('takes the code namespace from the permission key prefix', () => {
    const { body } = toHttpError(new Forbidden({ permission: 'scheduling:edit-allocations' }));
    expect(decoded(body).code).toBe('scheduling.missing_permission');
  });

  it('keeps NotFound at 404, defaulting the code to platform.not_found', () => {
    const { status, body } = toHttpError(new NotFound({ resource: 'User', id: 'x' }));
    expect(status).toBe(404);
    expect(decoded(body)).toEqual({
      _tag: 'NotFound',
      code: 'platform.not_found',
      message: 'User x not found',
    });
  });

  it('uses the module code a presenter sets', () => {
    const notFound = new NotFound({ resource: 'User', id: 'x', code: 'identity.user_not_found' });
    expect(decoded(toHttpError(notFound).body).code).toBe('identity.user_not_found');
  });

  it('keeps Conflict at 409 with its message, code and details', () => {
    const { status, body } = toHttpError(
      new Conflict({
        message: 'The intranet must keep at least one admin.',
        code: 'identity.last_admin_required',
        details: { userId: 'x' },
      }),
    );
    expect(status).toBe(409);
    expect(decoded(body)).toEqual({
      _tag: 'Conflict',
      code: 'identity.last_admin_required',
      message: 'The intranet must keep at least one admin.',
      details: { userId: 'x' },
    });
  });
});

describe('toHttpError for module rules', () => {
  it('maps Invalid to 400 ValidationError with its message, code and details', () => {
    const { status, body } = toHttpError(
      new Invalid({
        message: 'Only company-domain addresses can be added',
        code: 'identity.email_not_company_domain',
        details: { rules: ['not_company_domain'] },
      }),
    );
    expect(status).toBe(400);
    expect(decoded(body)).toEqual({
      _tag: 'ValidationError',
      code: 'identity.email_not_company_domain',
      message: 'Only company-domain addresses can be added',
      details: { rules: ['not_company_domain'] },
    });
  });
});

describe('access errors', () => {
  const manageAccess = Schema.decodeSync(Permission)('identity:manage-access');

  it('maps PermissionDenied to Forbidden and Unauthenticated keeping the reason', () => {
    expect(toContractError(new PermissionDenied({ permission: manageAccess }))).toEqual(
      new Forbidden({ permission: manageAccess }),
    );
    expect(toContractError(new UnauthenticatedActor({ reason: 'access-removed' }))).toEqual(
      new Unauthenticated({ reason: 'access-removed' }),
    );
  });

  it('passes contract errors through unchanged', () => {
    const unauthenticated = new Unauthenticated({});
    const conflict = new Conflict({ message: 'taken', code: 'identity.email_taken' });
    expect(toContractError(unauthenticated)).toBe(unauthenticated);
    expect(toContractError(conflict)).toBe(conflict);
  });
});
