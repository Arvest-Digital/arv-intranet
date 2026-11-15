import { Permission } from '@arv/kernel';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import * as scheduling from './index';
import { schedulingPermissions } from './permissions';

const isPermissionKey = Schema.is(Permission);

describe('schedulingPermissions', () => {
  it.each(schedulingPermissions.map((d) => [d.key, d] as const))(
    '%s is <module>:<kebab-action> with a name, description and feature',
    (key, declaration) => {
      expect(isPermissionKey(key)).toBe(true);
      expect(key).toMatch(/^scheduling:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(declaration.name.trim()).not.toBe('');
      expect(declaration.description.trim()).not.toBe('');
      expect(declaration.feature).toBe('Resource scheduling');
    },
  );

  it('has unique keys', () => {
    const keys = schedulingPermissions.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares the three scheduling permissions, exported from @arv/scheduling', () => {
    expect(scheduling.VIEW_WHOLE_BOARD).toBe('scheduling:view-whole-board');
    expect(scheduling.EDIT_ALLOCATIONS).toBe('scheduling:edit-allocations');
    expect(scheduling.SEE_LEAVE_REASONS).toBe('scheduling:see-leave-reasons');
    expect(scheduling.schedulingPermissions.map((d) => d.key)).toEqual([
      'scheduling:view-whole-board',
      'scheduling:edit-allocations',
      'scheduling:see-leave-reasons',
    ]);
  });
});
