import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ApiErrorBody } from './errors';

const decode = Schema.decodeUnknownEither(ApiErrorBody);

// Error examples from docs/features/identity/contracts/openapi.yaml (components.examples).
const openApiExamples = {
  ValidationFailed: {
    error: {
      _tag: 'ValidationError',
      code: 'platform.validation_failed',
      message: 'email: Invalid email address',
      details: { issues: [{ path: 'email', message: 'Invalid email address' }] },
    },
  },
  Unauthenticated: {
    error: {
      _tag: 'Unauthenticated',
      code: 'platform.unauthenticated',
      message: 'Sign in to continue',
    },
  },
  AccessRemoved: {
    error: {
      _tag: 'Unauthenticated',
      code: 'identity.access_removed',
      message: 'You no longer have access to the intranet',
    },
  },
  ForbiddenManageAccess: {
    error: {
      _tag: 'Forbidden',
      code: 'identity.missing_permission',
      message: 'You lack the permission to manage access',
      details: { missingPermissions: ['identity:manage-access'] },
    },
  },
  UserNotFound: {
    error: {
      _tag: 'NotFound',
      code: 'identity.user_not_found',
      message: 'This user is no longer on the access list',
    },
  },
  LastAdminRequired: {
    error: {
      _tag: 'Conflict',
      code: 'identity.last_admin_required',
      message: 'The intranet must keep at least one admin. Appoint another admin first.',
    },
  },
  InternalError: {
    error: {
      _tag: 'InternalError',
      code: 'platform.internal_error',
      message: 'Internal server error',
    },
  },
};

describe('ApiErrorBody', () => {
  it.each(Object.entries(openApiExamples))('decodes the OpenAPI %s example', (_name, example) => {
    expect(decode(example)).toEqual(Either.right(example));
  });

  it('rejects a body without a code', () => {
    expect(Either.isLeft(decode({ error: { _tag: 'Conflict', message: 'x' } }))).toBe(true);
  });

  it('rejects a free-text code', () => {
    const body = { error: { _tag: 'Conflict', code: 'Email taken', message: 'x' } };
    expect(Either.isLeft(decode(body))).toBe(true);
  });

  it('rejects an unknown _tag', () => {
    const body = { error: { _tag: 'Teapot', code: 'platform.teapot', message: 'x' } };
    expect(Either.isLeft(decode(body))).toBe(true);
  });
});
