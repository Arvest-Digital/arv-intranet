import type { Me } from '@arv/contracts/identity';

/** The permission that shows «Access» in the navigation and opens the admin screens (AC-08). */
export const MANAGE_ACCESS = 'identity:manage-access';

export const canManageAccess = (me: Me) => me.permissions.includes(MANAGE_ACCESS);

/** Shows «People» (org's employee records) in the navigation (AC-22). */
export const canManageEmployeeRecords = (me: Me) =>
  me.permissions.includes('org:manage-employee-records');

export {
  ACCESS_REMOVED,
  MISSING_PERMISSION,
  missingPermissionOf,
  type Refusal,
  refusalOf,
} from '~/shared/lib/refusal';
