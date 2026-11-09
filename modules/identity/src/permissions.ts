import { Permission, type PermissionDeclaration } from '@arv/kernel';

/** Identity's own permission: compose and assign access roles, grants nothing else (AC-19). */
export const MANAGE_ACCESS = Permission.make('identity:manage-access');

/**
 * The permissions identity checks, collected by the api host into the catalog (ADR-0004).
 * Keys are never renamed once granted (a rename retires the old key); name and description
 * are the glossary wording until PRD §8 Q1 settles the launch labels.
 */
export const identityPermissions: ReadonlyArray<PermissionDeclaration> = [
  {
    key: MANAGE_ACCESS,
    name: 'Manage access',
    description:
      'Add and remove people on the access list, and create, change and assign access roles.',
    feature: 'Access',
  },
];
