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

// Error examples from docs/features/resource-scheduling/contracts/openapi.yaml (ADR-0010 kinds).
const schedulingExamples = {
  ForbiddenImport: {
    error: {
      _tag: 'Forbidden',
      code: 'scheduling.missing_permission',
      message: 'You lack the permissions: manage employee records, manage projects',
      details: { missingPermissions: ['org:manage-employee-records', 'projects:manage-projects'] },
    },
  },
  OutsideEmploymentPeriod: {
    error: {
      _tag: 'ValidationError',
      code: 'scheduling.outside_employment_period',
      message: "The allocation falls outside the resource's employment period",
      details: { rules: ['outside_employment_period'], lastBookableDate: '2026-11-15' },
    },
  },
  AllocationVersionConflict: {
    error: {
      _tag: 'Conflict',
      code: 'scheduling.version_conflict',
      message: 'Test User 2 changed this allocation meanwhile',
      details: {
        current: {
          id: '01933b8e-0000-7000-8000-000000000601',
          version: 2,
          lastChangedBy: { id: '01933b8e-0000-7000-8000-000000000102', name: 'Test User 2' },
          lastChangedAt: '2026-10-31T09:05:00Z',
        },
      },
    },
  },
  OverbookingConfirmationRequired: {
    error: {
      _tag: 'ConfirmationRequired',
      code: 'scheduling.overbooking_confirmation_required',
      message: 'The resource will be overbooked in 1 week',
      details: {
        overbookedWeeks: [
          {
            weekStart: '2026-11-09',
            capacityMinutes: 1920,
            allocatedMinutes: 2400,
            overMinutes: 480,
          },
        ],
        workOnLeaveDays: [],
      },
    },
  },
};

describe('ApiErrorBody', () => {
  it.each(Object.entries({ ...openApiExamples, ...schedulingExamples }))(
    'decodes the OpenAPI %s example',
    (_name, example) => {
      expect(decode(example)).toEqual(Either.right(example));
    },
  );

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
