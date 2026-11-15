import { Permission } from '@arv/kernel';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import * as org from './index';
import { orgPermissions } from './permissions';

const isPermissionKey = Schema.is(Permission);

describe('orgPermissions', () => {
  it.each(orgPermissions.map((d) => [d.key, d] as const))(
    '%s is <module>:<kebab-action> with a name, description and feature',
    (key, declaration) => {
      expect(isPermissionKey(key)).toBe(true);
      expect(key).toMatch(/^org:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(declaration.name.trim()).not.toBe('');
      expect(declaration.description.trim()).not.toBe('');
      expect(declaration.feature).toBe('Resource scheduling');
    },
  );

  it('has unique keys', () => {
    const keys = orgPermissions.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares the two org permissions, exported from @arv/org', () => {
    expect(org.MANAGE_EMPLOYEE_RECORDS).toBe('org:manage-employee-records');
    expect(org.MANAGE_HOLIDAY_LIST).toBe('org:manage-holiday-list');
    expect(org.orgPermissions.map((d) => d.key)).toEqual([
      'org:manage-employee-records',
      'org:manage-holiday-list',
    ]);
  });
});
