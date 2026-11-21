/**
 * The one place page URLs are written. `routes.ts` registers pages at these paths and links,
 * redirects and tests use them, so moving a page is a one-line change.
 */
export const PATHS = {
  home: '/',
  // Schedule section
  board: '/schedule',
  mySchedule: '/schedule/mine',
  people: '/schedule/people',
  teams: '/schedule/people/teams',
  projects: '/schedule/projects',
  holidays: '/schedule/holidays',
  import: '/schedule/import',
  allocations: '/schedule/allocations',
  allocationHistory: (allocationId: string) => `/schedule/allocations/${allocationId}/history`,
  // Access & users section
  accessUsers: '/access/users',
  accessRoles: '/access/roles',
  accessRoleNew: '/access/roles/new',
  accessRole: (accessRoleId: string) => `/access/roles/${accessRoleId}`,
} as const;
