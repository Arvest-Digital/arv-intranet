import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AccessRole,
  AccessRoleInput,
  AccessRolePage,
  isRetired,
  PermissionCatalog,
  PreselectedAccessRole,
} from './access-role';

// Examples from docs/features/identity/contracts/openapi.yaml (components.examples).
const manageAccess = {
  key: 'identity:manage-access',
  name: 'Manage access',
  description: 'Add and remove people on the access list, and compose and assign access roles.',
  feature: 'Identity',
};
const viewWholeBoard = {
  key: 'scheduling:view-whole-board',
  name: 'View the whole board',
  description: "See every resource's allocations on the schedule board.",
  feature: 'Resource scheduling',
};
const accessRole = {
  id: '01933b8e-0000-7000-8000-000000000202',
  name: 'Planner',
  isPreselected: false,
  holderCount: 5,
  permissions: [viewWholeBoard],
  retiredPermissionKeys: ['scheduling:edit-allocations'],
  createdAt: '2026-11-02T09:00:00.000Z',
};
const accessRolePage = {
  items: [
    {
      id: '01933b8e-0000-7000-8000-000000000201',
      name: 'Admin',
      isPreselected: false,
      holderCount: 2,
      permissions: [manageAccess],
      retiredPermissionKeys: [],
      createdAt: '2026-11-01T09:00:00.000Z',
    },
    {
      id: '01933b8e-0000-7000-8000-000000000203',
      name: 'Staff',
      isPreselected: true,
      holderCount: 25,
      permissions: [],
      retiredPermissionKeys: [],
      createdAt: '2026-11-01T09:05:00.000Z',
    },
  ],
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
};
const accessRoleInput = {
  name: 'Planner',
  permissionKeys: ['scheduling:view-whole-board', 'scheduling:edit-allocations'],
};
const accessRoleChange = { name: 'Planner', permissionKeys: ['scheduling:view-whole-board'] };
const preselected = { accessRoleId: '01933b8e-0000-7000-8000-000000000203' };
const preselectedCleared = { accessRoleId: null };
const permissionCatalog = { items: [manageAccess, viewWholeBoard] };

const isLeft = (result: Either.Either<unknown, unknown>) => Either.isLeft(result);

describe('AccessRole', () => {
  const decode = Schema.decodeUnknownEither(AccessRole);

  it('decodes the OpenAPI example and encodes it back', () => {
    const decoded = Schema.decodeUnknownSync(AccessRole)(accessRole);
    expect(decoded.createdAt).toBeInstanceOf(Date);
    expect(isRetired(decoded)).toBe(true);
    expect(Schema.encodeSync(AccessRole)(decoded)).toEqual(accessRole);
  });

  it.each([
    ['a negative holderCount', { ...accessRole, holderCount: -1 }],
    ['a fractional holderCount', { ...accessRole, holderCount: 1.5 }],
    ['a malformed retired key', { ...accessRole, retiredPermissionKeys: ['Edit Allocations'] }],
    ['a missing isPreselected', { ...accessRole, isPreselected: undefined }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('AccessRolePage', () => {
  const decode = Schema.decodeUnknownEither(AccessRolePage);

  it('decodes the OpenAPI example and encodes it back', () => {
    const decoded = Schema.decodeUnknownSync(AccessRolePage)(accessRolePage);
    expect(decoded.items.map(isRetired)).toEqual([false, false]);
    expect(Schema.encodeSync(AccessRolePage)(decoded)).toEqual(accessRolePage);
  });

  it('rejects a page without hasPrev', () => {
    const { hasPrev: _, ...page } = accessRolePage;
    expect(isLeft(decode(page))).toBe(true);
  });
});

describe('AccessRoleInput', () => {
  const decode = Schema.decodeUnknownEither(AccessRoleInput);

  it.each([
    ['create (AccessRoleInput)', accessRoleInput],
    ['update (AccessRoleChange)', accessRoleChange],
  ])('decodes the OpenAPI %s example', (_, example) => {
    expect(decode(example)).toEqual(Either.right(example));
  });

  it.each([
    ['an empty name', { ...accessRoleInput, name: '' }],
    ['an untrimmed name', { ...accessRoleInput, name: ' Planner ' }],
    ['a too long name', { ...accessRoleInput, name: 'x'.repeat(101) }],
    ['a malformed key', { ...accessRoleInput, permissionKeys: ['scheduling'] }],
    [
      'duplicate keys',
      { ...accessRoleInput, permissionKeys: ['identity:manage-access', 'identity:manage-access'] },
    ],
    ['an unknown key', { ...accessRoleInput, isPreselected: true }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('PreselectedAccessRole', () => {
  const decode = Schema.decodeUnknownEither(PreselectedAccessRole);

  it.each([
    ['mark', preselected],
    ['clear', preselectedCleared],
  ])('decodes the OpenAPI %s example', (_, example) => {
    expect(decode(example)).toEqual(Either.right(example));
  });

  it.each([
    ['a non-UUID id', { accessRoleId: 'staff' }],
    ['a missing accessRoleId', {}],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('PermissionCatalog', () => {
  const decode = Schema.decodeUnknownEither(PermissionCatalog);

  it('decodes the OpenAPI example', () => {
    expect(decode(permissionCatalog)).toEqual(Either.right(permissionCatalog));
  });

  it('rejects a declaration without a description', () => {
    const { description: _, ...declaration } = manageAccess;
    expect(isLeft(decode({ items: [declaration] }))).toBe(true);
  });
});
