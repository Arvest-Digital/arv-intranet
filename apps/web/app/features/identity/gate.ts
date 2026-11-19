import type { Me } from '@arv/contracts/identity';

/** The permission that shows «Access» in the navigation and opens the admin screens (AC-08). */
export const MANAGE_ACCESS = 'identity:manage-access';

export const canManageAccess = (me: Me) => me.permissions.includes(MANAGE_ACCESS);

/** Shows «People» (org's employee records) in the navigation (AC-22). */
export const canManageEmployeeRecords = (me: Me) =>
  me.permissions.includes('org:manage-employee-records');

/** Shows «Schedule»: the board needs view-whole-board or edit-allocations (AC-01, AC-03). */
export const canViewBoard = (me: Me) =>
  ['scheduling:view-whole-board', 'scheduling:edit-allocations'].some((permission) =>
    me.permissions.includes(permission),
  );

/**
 * Shows «Projects» in the navigation: project upkeep and the board's readers may list them
 * (openapi `listProjects`, AC-26).
 */
export const canReadProjects = (me: Me) =>
  ['projects:manage-projects', 'scheduling:view-whole-board', 'scheduling:edit-allocations'].some(
    (permission) => me.permissions.includes(permission),
  );

export {
  ACCESS_REMOVED,
  MISSING_PERMISSION,
  missingPermissionOf,
  type Refusal,
  refusalOf,
} from '~/shared/lib/refusal';
