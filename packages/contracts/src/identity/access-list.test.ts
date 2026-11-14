import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  PageQuery,
  UserAccessRolesChange,
  UserChange,
  UserCreate,
  UserPage,
  UserWithAccessRoles,
} from './access-list';

// Examples from docs/features/identity/contracts/openapi.yaml (components.examples).
const user = {
  id: '01933b8e-0000-7000-8000-000000000103',
  email: 'user-3@example.test',
  name: 'Test User 3',
  accessRoles: [
    { id: '01933b8e-0000-7000-8000-000000000202', name: 'Planner' },
    { id: '01933b8e-0000-7000-8000-000000000203', name: 'Staff' },
  ],
  combinedPermissions: [
    {
      key: 'scheduling:view-whole-board',
      name: 'View the whole board',
      description: "See every resource's allocations on the schedule board.",
      feature: 'Resource scheduling',
    },
    {
      key: 'scheduling:edit-allocations',
      name: 'Edit allocations',
      description: 'Create, change and remove allocations on the schedule board.',
      feature: 'Resource scheduling',
    },
  ],
  createdAt: '2026-11-03T09:00:00.000Z',
};
const userPage = {
  items: [
    {
      id: '01933b8e-0000-7000-8000-000000000101',
      email: 'user-1@example.test',
      name: 'Test User 1',
      accessRoles: [{ id: '01933b8e-0000-7000-8000-000000000201', name: 'Admin' }],
      combinedPermissions: [
        {
          key: 'identity:manage-access',
          name: 'Manage access',
          description:
            'Add and remove people on the access list, and compose and assign access roles.',
          feature: 'Identity',
        },
      ],
      createdAt: '2026-11-01T09:00:00.000Z',
    },
  ],
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
};
const userCreate = {
  email: 'user-3@example.test',
  name: 'Test User 3',
  accessRoleIds: ['01933b8e-0000-7000-8000-000000000203'],
};
const userChange = { name: 'Test User 3' };
const userAccessRolesChange = {
  accessRoleIds: ['01933b8e-0000-7000-8000-000000000203', '01933b8e-0000-7000-8000-000000000202'],
};

const isLeft = (result: Either.Either<unknown, unknown>) => Either.isLeft(result);

describe('UserWithAccessRoles (OpenAPI User)', () => {
  const decode = Schema.decodeUnknownEither(UserWithAccessRoles);

  it('decodes the OpenAPI example and encodes it back', () => {
    const decoded = Schema.decodeUnknownSync(UserWithAccessRoles)(user);
    expect(decoded.createdAt).toBeInstanceOf(Date);
    expect(Schema.encodeSync(UserWithAccessRoles)(decoded)).toEqual(user);
  });

  it.each([
    [
      'a malformed combined permission key',
      { ...user, combinedPermissions: [{ ...user.combinedPermissions[0], key: 'edit' }] },
    ],
    ['an access role without a name', { ...user, accessRoles: [{ id: user.accessRoles[0]?.id }] }],
    ['a missing createdAt', { ...user, createdAt: undefined }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('UserPage', () => {
  const decode = Schema.decodeUnknownEither(UserPage);

  it('decodes the OpenAPI example and encodes it back', () => {
    const decoded = Schema.decodeUnknownSync(UserPage)(userPage);
    expect(Schema.encodeSync(UserPage)(decoded)).toEqual(userPage);
  });

  it('accepts a UUID nextCursor', () => {
    const page = { ...userPage, hasNext: true, nextCursor: userPage.items[0]?.id };
    expect(Either.isRight(decode(page))).toBe(true);
  });

  it('rejects a non-UUID nextCursor', () => {
    expect(isLeft(decode({ ...userPage, nextCursor: 'page-2' }))).toBe(true);
  });
});

describe('UserCreate', () => {
  const decode = Schema.decodeUnknownEither(UserCreate);

  it('decodes the OpenAPI example', () => {
    expect(decode(userCreate)).toEqual(Either.right(userCreate));
  });

  it('accepts no access roles', () => {
    expect(Either.isRight(decode({ ...userCreate, accessRoleIds: [] }))).toBe(true);
  });

  it.each([
    ['an invalid email', { ...userCreate, email: 'not-an-email' }],
    ['an empty name', { ...userCreate, name: '' }],
    ['a too long name', { ...userCreate, name: 'x'.repeat(101) }],
    [
      'duplicate role ids',
      { ...userCreate, accessRoleIds: [userCreate.accessRoleIds[0], userCreate.accessRoleIds[0]] },
    ],
    ['missing accessRoleIds', { email: userCreate.email, name: userCreate.name }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('UserChange', () => {
  const decode = Schema.decodeUnknownEither(UserChange);

  it('decodes the OpenAPI example', () => {
    expect(decode(userChange)).toEqual(Either.right(userChange));
  });

  it('rejects a body carrying email (the address cannot be changed)', () => {
    expect(isLeft(decode({ ...userChange, email: 'user-9@example.test' }))).toBe(true);
  });

  it('rejects the same body even when validated with errors: all', () => {
    const all = Schema.decodeUnknownEither(UserChange, { errors: 'all' });
    expect(isLeft(all({ ...userChange, email: 'user-9@example.test' }))).toBe(true);
  });
});

describe('UserAccessRolesChange', () => {
  const decode = Schema.decodeUnknownEither(UserAccessRolesChange);

  it('decodes the OpenAPI example', () => {
    expect(decode(userAccessRolesChange)).toEqual(Either.right(userAccessRolesChange));
  });

  it('rejects a non-UUID role id', () => {
    expect(isLeft(decode({ accessRoleIds: ['planner'] }))).toBe(true);
  });
});

describe('PageQuery', () => {
  const decode = Schema.decodeUnknownEither(PageQuery);
  const id = '01933b8e-0000-7000-8000-000000000101';

  it.each([
    ['no parameters', {}, {}],
    ['after with a string limit', { after: id, limit: '20' }, { after: id, limit: 20 }],
    ['before', { before: id }, { before: id }],
  ])('decodes %s', (_, input, expected) => {
    expect(decode(input)).toEqual(Either.right(expected));
  });

  it.each([
    ['both after and before', { after: id, before: id }],
    ['a non-UUID cursor', { after: 'page-2' }],
    ['a zero limit', { limit: '0' }],
    ['a limit above 100', { limit: '101' }],
    ['a fractional limit', { limit: '2.5' }],
    ['a non-numeric limit', { limit: 'ten' }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});
