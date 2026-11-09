import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccessRoleName, accessRoleNameKey, changeGrants, splitGrants } from './access-role';
import { RetiredPermissionNotAssignable } from './errors';

const declared = new Set(['identity:manage-access', 'scheduling:edit-allocations']);

describe('AccessRoleName', () => {
  const decode = Schema.decodeUnknownEither(AccessRoleName);

  it('keeps the trimmed display form', () => {
    expect(decode('  Planner ')).toEqual(Either.right('Planner'));
  });

  it('refuses a blank name and one longer than 100 characters', () => {
    expect(Either.isLeft(decode('  '))).toBe(true);
    expect(Either.isRight(decode('a'.repeat(100)))).toBe(true);
    expect(Either.isLeft(decode('a'.repeat(101)))).toBe(true);
  });
});

describe('accessRoleNameKey', () => {
  it('gives «Planner» and «planner » the same key (AC-10)', () => {
    expect(accessRoleNameKey('Planner')).toBe(accessRoleNameKey('planner '));
    expect(accessRoleNameKey('Planner')).toBe('planner');
  });

  it('gives different names different keys', () => {
    expect(accessRoleNameKey('Planner')).not.toBe(accessRoleNameKey('Admin'));
  });
});

describe('splitGrants', () => {
  it('marks exactly the keys not in the declared set as retired (AC-16)', () => {
    const grants = splitGrants(
      ['identity:manage-access', 'reports:export', 'scheduling:edit-allocations', 'old:thing'],
      declared,
    );
    expect(grants.active).toEqual(['identity:manage-access', 'scheduling:edit-allocations']);
    expect(grants.retired).toEqual(['reports:export', 'old:thing']);
  });

  it('has no retired keys when every key is declared, and no active ones when none is', () => {
    expect(splitGrants(['identity:manage-access'], declared).retired).toEqual([]);
    expect(splitGrants(['old:thing'], new Set()).active).toEqual([]);
  });
});

describe('changeGrants', () => {
  it('refuses to add an undeclared key (AC-16)', () => {
    const result = changeGrants(
      ['identity:manage-access'],
      ['identity:manage-access', 'old:thing'],
      declared,
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(RetiredPermissionNotAssignable);
      expect(result.left.keys).toEqual(['old:thing']);
    }
  });

  it('allows keeping an already granted retired key', () => {
    const result = changeGrants(
      ['identity:manage-access', 'old:thing'],
      ['scheduling:edit-allocations', 'old:thing'],
      declared,
    );
    expect(result).toEqual(Either.right(new Set(['scheduling:edit-allocations', 'old:thing'])));
  });

  it('allows removing a retired key', () => {
    expect(changeGrants(['old:thing'], [], declared)).toEqual(Either.right(new Set()));
  });
});
