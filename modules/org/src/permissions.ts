import { Permission, type PermissionDeclaration } from '@arv/kernel';

/** Create and change employee records, link logins, and maintain teams (US-07, AC-22). */
export const MANAGE_EMPLOYEE_RECORDS = Permission.make('org:manage-employee-records');

/** Add and remove public holidays on the single company list (US-09, AC-28). */
export const MANAGE_HOLIDAY_LIST = Permission.make('org:manage-holiday-list');

/**
 * The permissions org checks, collected by the api host into the catalog (ADR-0004). Keys are
 * never renamed once granted (a rename retires the old key); name and description are the PRD
 * wording until PRD §8 Q1 settles the launch labels.
 */
export const orgPermissions: ReadonlyArray<PermissionDeclaration> = [
  {
    key: MANAGE_EMPLOYEE_RECORDS,
    name: 'Manage employee records',
    description:
      "Create employee records, link them to intranet logins, set a resource's team, contract hours, working days and employment period, and maintain teams and their team leads. Also shows employment end dates.",
    feature: 'Resource scheduling',
  },
  {
    key: MANAGE_HOLIDAY_LIST,
    name: 'Manage holiday list',
    description: 'Add and remove public holidays on the single company holiday list.',
    feature: 'Resource scheduling',
  },
];
