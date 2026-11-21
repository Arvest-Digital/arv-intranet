import { Permission } from '@arv/kernel';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import * as projects from './index';
import { projectsPermissions } from './permissions';

const isPermissionKey = Schema.is(Permission);

describe('projectsPermissions', () => {
  it.each(projectsPermissions.map((d) => [d.key, d] as const))(
    '%s is <module>:<kebab-action> with a name, description and feature',
    (key, declaration) => {
      expect(isPermissionKey(key)).toBe(true);
      expect(key).toMatch(/^projects:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(declaration.name.trim()).not.toBe('');
      expect(declaration.description.trim()).not.toBe('');
      expect(declaration.feature).toBe('Resource scheduling');
    },
  );

  it('has unique keys', () => {
    const keys = projectsPermissions.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares projects:manage-projects, exported from @arv/projects', () => {
    expect(projects.MANAGE_PROJECTS).toBe('projects:manage-projects');
    expect(projects.projectsPermissions.map((d) => d.key)).toContain('projects:manage-projects');
  });
});
