import { IdentityErrorCodes } from '@arv/contracts/identity';
import { Permission, PermissionDenied, UserId } from '@arv/kernel';
import { Effect, Either } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccessRoleId } from '../application/ports';
import {
  AccessRoleNameTaken,
  AccessRoleNotFound,
  EmailTaken,
  LastAdminRequired,
  NotCompanyAddress,
  RetiredPermissionNotAssignable,
  UserNotFound,
} from '../domain/errors';
import { User } from '../domain/user';
import {
  mapAccessListErrors,
  mapAccessRoleErrors,
  presentAccessRole,
  presentUserAccess,
  toAccessListContractError,
  toAccessRoleContractError,
} from './presenter';

const user = new User({
  id: UserId.make('01933b8e-0000-7000-8000-000000000103'),
  email: 'user-3@example.test',
  name: 'Test User 3',
  createdAt: new Date('2026-11-03T09:00:00Z'),
});

describe('presentUserAccess', () => {
  it('encodes the user with roles, combined permissions and an ISO createdAt', () => {
    const planner = {
      id: AccessRoleId.make('01933b8e-0000-7000-8000-000000000202'),
      name: 'Planner',
    };
    const viewBoard = {
      key: Permission.make('scheduling:view-whole-board'),
      name: 'View the whole board',
      description: "See every resource's allocations on the schedule board.",
      feature: 'Resource scheduling',
    };
    expect(
      presentUserAccess({ user, accessRoles: [planner], combinedPermissions: [viewBoard] }),
    ).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      accessRoles: [planner],
      combinedPermissions: [viewBoard],
      createdAt: '2026-11-03T09:00:00.000Z',
    });
  });
});

describe('toAccessListContractError', () => {
  it.each([
    [new UserNotFound({ id: 'x' }), 'NotFound', IdentityErrorCodes.userNotFound],
    [new AccessRoleNotFound({ id: 'x' }), 'NotFound', IdentityErrorCodes.accessRoleNotFound],
    [new EmailTaken({ email: 'a@example.test' }), 'Conflict', IdentityErrorCodes.emailTaken],
    [
      new NotCompanyAddress({ email: 'a@other.test' }),
      'Invalid',
      IdentityErrorCodes.emailNotCompanyDomain,
    ],
    [new LastAdminRequired(), 'Conflict', IdentityErrorCodes.lastAdminRequired],
  ])('maps %s', (error, tag, code) => {
    expect(toAccessListContractError(error)).toMatchObject({ _tag: tag, code });
  });

  it('names only the broken rule for a foreign address, not the address', () => {
    const error = toAccessListContractError(new NotCompanyAddress({ email: 'a@other.test' }));
    expect(error).toMatchObject({ details: { rules: ['not_company_domain'] } });
    expect(JSON.stringify(error)).not.toContain('other.test');
  });
});

describe('mapAccessListErrors', () => {
  it('lets the kernel access errors through for runEffect to map', () => {
    const denied = new PermissionDenied({ permission: Permission.make('identity:manage-access') });
    const result = Effect.runSync(Effect.either(mapAccessListErrors(Effect.fail(denied))));
    expect(result).toEqual(Either.left(denied));
  });
});

describe('presentAccessRole', () => {
  it('encodes declared and retired keys apart and createdAt as ISO', () => {
    const view = {
      id: AccessRoleId.make('01933b8e-0000-7000-8000-000000000202'),
      name: 'Planner',
      isPreselected: true,
      holderCount: 2,
      permissions: [],
      retiredPermissionKeys: ['scheduling:edit-allocations'],
      createdAt: new Date('2026-11-03T09:00:00Z'),
    };
    expect(presentAccessRole(view)).toEqual({ ...view, createdAt: '2026-11-03T09:00:00.000Z' });
  });
});

describe('toAccessRoleContractError', () => {
  it.each([
    [new AccessRoleNotFound({ id: 'x' }), 'NotFound', IdentityErrorCodes.accessRoleNotFound],
    [
      new AccessRoleNameTaken({ name: 'Planner' }),
      'Conflict',
      IdentityErrorCodes.duplicateAccessRoleName,
    ],
    [new LastAdminRequired(), 'Conflict', IdentityErrorCodes.lastAdminRequired],
  ])('maps %s', (error, tag, code) => {
    expect(toAccessRoleContractError(error)).toMatchObject({ _tag: tag, code });
  });

  it('answers a retired key as 400 naming the refused keys (AC-16)', () => {
    const error = toAccessRoleContractError(
      new RetiredPermissionNotAssignable({ keys: ['scheduling:edit-allocations'] }),
    );
    expect(error).toMatchObject({
      _tag: 'Invalid',
      code: IdentityErrorCodes.retiredPermission,
      message: 'A retired permission cannot be added: scheduling:edit-allocations',
      details: { rules: ['retired_permission'], permissionKeys: ['scheduling:edit-allocations'] },
    });
  });
});

describe('mapAccessRoleErrors', () => {
  it('lets the kernel access errors through for runEffect to map', () => {
    const denied = new PermissionDenied({ permission: Permission.make('identity:manage-access') });
    const result = Effect.runSync(Effect.either(mapAccessRoleErrors(Effect.fail(denied))));
    expect(result).toEqual(Either.left(denied));
  });
});
