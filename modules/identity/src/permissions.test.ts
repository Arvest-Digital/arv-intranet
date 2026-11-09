import { Permission } from '@arv/kernel';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import * as identity from './index';
import { identityPermissions } from './permissions';

const isPermissionKey = Schema.is(Permission);

describe('identityPermissions', () => {
  it.each(identityPermissions.map((d) => [d.key, d] as const))(
    '%s is <module>:<kebab-action> with a name, description and feature',
    (key, declaration) => {
      expect(isPermissionKey(key)).toBe(true);
      expect(key).toMatch(/^identity:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(declaration.name.trim()).not.toBe('');
      expect(declaration.description.trim()).not.toBe('');
      expect(declaration.feature).toBe('Access');
    },
  );

  it('has unique keys', () => {
    const keys = identityPermissions.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares identity:manage-access, exported from @arv/identity', () => {
    expect(identity.MANAGE_ACCESS).toBe('identity:manage-access');
    expect(identity.identityPermissions.map((d) => d.key)).toContain('identity:manage-access');
  });
});
