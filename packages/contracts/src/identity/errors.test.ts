import { ApiErrorBody } from '@arv/contracts/shared';
import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  IdentityErrorCode,
  IdentityErrorCodes,
  MissingPermissions,
  NotOnAccessListDetails,
  RuleViolations,
} from './errors';

// Every identity.* error example from docs/features/identity/contracts/openapi.yaml.
const openApiExamples = {
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
  SignInRefused: {
    error: {
      _tag: 'Forbidden',
      code: 'identity.sign_in_refused',
      message: 'Only verified company Google accounts can sign in',
    },
  },
  NotOnAccessList: {
    error: {
      _tag: 'Forbidden',
      code: 'identity.not_on_access_list',
      message: "You are not on the intranet's access list yet. Ask one of these admins to add you.",
      details: {
        admins: [
          { name: 'Test User 1', email: 'user-1@example.test' },
          { name: 'Test User 2', email: 'user-2@example.test' },
        ],
      },
    },
  },
  NotOnAccessListNoAdmin: {
    error: {
      _tag: 'Forbidden',
      code: 'identity.not_on_access_list',
      message: "You are not on the intranet's access list yet. Ask your manager.",
      details: { admins: [] },
    },
  },
  EmailNotCompanyDomain: {
    error: {
      _tag: 'ValidationError',
      code: 'identity.email_not_company_domain',
      message: 'Only company-domain addresses can be added',
      details: { rules: ['not_company_domain'] },
    },
  },
  EmailTaken: {
    error: {
      _tag: 'Conflict',
      code: 'identity.email_taken',
      message: 'This address is already on the access list',
    },
  },
  UserNotFound: {
    error: {
      _tag: 'NotFound',
      code: 'identity.user_not_found',
      message: 'This user is no longer on the access list',
    },
  },
  AccessRoleNotFound: {
    error: {
      _tag: 'NotFound',
      code: 'identity.access_role_not_found',
      message: 'This access role no longer exists',
    },
  },
  DuplicateAccessRoleName: {
    error: {
      _tag: 'Conflict',
      code: 'identity.duplicate_access_role_name',
      message: 'An access role with that name already exists',
    },
  },
  RetiredPermission: {
    error: {
      _tag: 'ValidationError',
      code: 'identity.retired_permission',
      message: 'A retired permission cannot be added: scheduling:edit-allocations',
      details: { rules: ['retired_permission'], permissionKeys: ['scheduling:edit-allocations'] },
    },
  },
  LastAdminRequired: {
    error: {
      _tag: 'Conflict',
      code: 'identity.last_admin_required',
      message: 'The intranet must keep at least one admin. Appoint another admin first.',
    },
  },
};

const isLeft = (result: Either.Either<unknown, unknown>) => Either.isLeft(result);

describe('identity error examples', () => {
  it.each(Object.entries(openApiExamples))(
    '%s decodes as an ApiErrorBody with an identity code',
    (_, example) => {
      expect(Schema.decodeUnknownEither(ApiErrorBody)(example)).toEqual(Either.right(example));
      expect(Schema.is(IdentityErrorCode)(example.error.code)).toBe(true);
    },
  );
});

describe('IdentityErrorCode', () => {
  it('lists exactly the codes of IdentityErrorCodes', () => {
    expect([...IdentityErrorCode.literals].sort()).toEqual(
      Object.values(IdentityErrorCodes).sort(),
    );
  });

  it.each([['platform.not_found'], ['identity.teapot'], ['IDENTITY.EMAIL_TAKEN']])(
    'rejects %s',
    (code) => {
      expect(Schema.is(IdentityErrorCode)(code)).toBe(false);
    },
  );
});

describe('RuleViolations', () => {
  const decode = Schema.decodeUnknownEither(RuleViolations);

  it.each([
    ['EmailNotCompanyDomain', openApiExamples.EmailNotCompanyDomain.error.details],
    ['RetiredPermission', openApiExamples.RetiredPermission.error.details],
  ])('decodes the %s details', (_, details) => {
    expect(decode(details)).toEqual(Either.right(details));
  });

  it.each([
    ['no rules', { rules: [] }],
    ['an unknown rule', { rules: ['too_cool'] }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('MissingPermissions', () => {
  const decode = Schema.decodeUnknownEither(MissingPermissions);
  const details = openApiExamples.ForbiddenManageAccess.error.details;

  it('decodes the ForbiddenManageAccess details', () => {
    expect(decode(details)).toEqual(Either.right(details));
  });

  it('rejects an empty list', () => {
    expect(isLeft(decode({ missingPermissions: [] }))).toBe(true);
  });
});

describe('NotOnAccessListDetails', () => {
  const decode = Schema.decodeUnknownEither(NotOnAccessListDetails);

  it.each([
    ['NotOnAccessList', openApiExamples.NotOnAccessList.error.details],
    ['NotOnAccessListNoAdmin', openApiExamples.NotOnAccessListNoAdmin.error.details],
  ])('decodes the %s details', (_, details) => {
    expect(decode(details)).toEqual(Either.right(details));
  });

  it('rejects an admin without an email', () => {
    expect(isLeft(decode({ admins: [{ name: 'Test User 1' }] }))).toBe(true);
  });
});
