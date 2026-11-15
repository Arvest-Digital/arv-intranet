import { Permission, type PermissionDeclaration } from '@arv/kernel';

/** See every resource's schedule: the board, the free list and allocation history (US-01, AC-03). */
export const VIEW_WHOLE_BOARD = Permission.make('scheduling:view-whole-board');

/** Create, change and remove allocations and book leave; includes view-whole-board (AC-12b). */
export const EDIT_ALLOCATIONS = Permission.make('scheduling:edit-allocations');

/** See a leave's type instead of «away» for every resource (US-10, AC-29). */
export const SEE_LEAVE_REASONS = Permission.make('scheduling:see-leave-reasons');

/**
 * The permissions scheduling checks, collected by the api host into the catalog (ADR-0004).
 * Keys are never renamed once granted (a rename retires the old key); name and description
 * are the glossary wording until PRD §8 Q1 settles the launch labels.
 */
export const schedulingPermissions: ReadonlyArray<PermissionDeclaration> = [
  {
    key: VIEW_WHOLE_BOARD,
    name: 'View the whole board',
    description:
      "See every resource's allocated hours against capacity on the schedule board, find who is free, and read allocation history.",
    feature: 'Scheduling',
  },
  {
    key: EDIT_ALLOCATIONS,
    name: 'Edit allocations',
    description:
      'Create, change and remove allocations and book leave. Includes everything view the whole board allows.',
    feature: 'Scheduling',
  },
  {
    key: SEE_LEAVE_REASONS,
    name: 'See leave reasons',
    description:
      "See the type of a resource's leave, such as sick leave; everyone else sees only «away».",
    feature: 'Scheduling',
  },
];
