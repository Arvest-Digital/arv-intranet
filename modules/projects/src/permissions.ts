import { Permission, type PermissionDeclaration } from '@arv/kernel';

/** Create projects of every type and close them (US-08, AC-23–AC-26). */
export const MANAGE_PROJECTS = Permission.make('projects:manage-projects');

/**
 * The permissions projects checks, collected by the api host into the catalog (ADR-0004).
 * Keys are never renamed once granted (a rename retires the old key); name and description
 * are the glossary wording until the launch labels are settled.
 */
export const projectsPermissions: ReadonlyArray<PermissionDeclaration> = [
  {
    key: MANAGE_PROJECTS,
    name: 'Manage projects',
    description:
      'Create client, internal, bench, training and leave projects, and close them when they end.',
    feature: 'Resource scheduling',
  },
];
