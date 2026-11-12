import type { AccessRole, UserWithAccessRoles } from '@arv/contracts/identity';

/** Decoded access-list data for the identity screens' component tests. */

export const manageAccess = {
  key: 'identity:manage-access',
  name: 'Manage access',
  description: 'Add and remove people and decide what they may do.',
  feature: 'Identity',
};
export const editAllocations = {
  key: 'scheduling:edit-allocations',
  name: 'Edit allocations',
  description: 'Change who works on which project and for how long.',
  feature: 'Resource scheduling',
};

const role = (overrides: Partial<AccessRole> & Pick<AccessRole, 'id' | 'name'>): AccessRole => ({
  isPreselected: false,
  holderCount: 0,
  permissions: [],
  retiredPermissionKeys: [],
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  ...overrides,
});

export const admin = role({
  id: '0d4b6c1e-1a2b-4c3d-8e4f-5a6b7c8d9e01',
  name: 'Admin',
  holderCount: 1,
  permissions: [manageAccess],
});
export const staff = role({
  id: '0d4b6c1e-1a2b-4c3d-8e4f-5a6b7c8d9e02',
  name: 'Staff',
  isPreselected: true,
});
export const planner = role({
  id: '0d4b6c1e-1a2b-4c3d-8e4f-5a6b7c8d9e03',
  name: 'Planner',
  permissions: [editAllocations],
});
export const roles = [admin, staff, planner];

export const anna: UserWithAccessRoles = {
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
  email: 'anna@arvest.digital',
  name: 'Anna Kovalenko',
  accessRoles: [
    { id: staff.id, name: staff.name },
    { id: planner.id, name: planner.name },
  ],
  combinedPermissions: [editAllocations],
  createdAt: new Date('2026-10-13T10:00:00.000Z'),
};
