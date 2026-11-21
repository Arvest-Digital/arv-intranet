import type { ProjectType } from '@arv/contracts/projects';

/** Creates and closes projects (AC-23–AC-26). */
export const MANAGE_PROJECTS = 'projects:manage-projects';

/** The permission named on the refusal screen (AC-26). */
export const MANAGE_PROJECTS_LABEL = 'manage projects';

/** The project types in the order the page lists them. */
export const PROJECT_TYPES: ReadonlyArray<readonly [ProjectType, string]> = [
  ['client', 'Client'],
  ['internal', 'Internal'],
  ['bench', 'Bench'],
  ['training', 'Training'],
  ['leave', 'Leave'],
];

export const TYPE_LABEL = Object.fromEntries(PROJECT_TYPES) as Record<ProjectType, string>;

export const TYPE_HELP: Record<ProjectType, string> = {
  client: 'Work for a client.',
  internal: 'Internal company work.',
  bench: 'Time between projects.',
  training: 'Courses and learning.',
  leave: 'Booked with “Book leave” in whole days.',
};

export const isProjectType = (value: string): value is ProjectType =>
  PROJECT_TYPES.some(([type]) => type === value);

/** The project forms' fields, as the action names them when a refusal belongs under one. */
export type ProjectField = 'name' | 'type' | 'closeDate';

/** An allocation the close would trim or remove (AC-25), ready to list. */
export type ClosingRow = {
  readonly allocationId: string;
  readonly employeeName: string;
  readonly startsOn: string;
  readonly endsOn: string;
};

/** What the projects action answers the page. */
export type ProjectActionResult =
  | { readonly ok: true; readonly intent: 'create'; readonly projectId: string }
  | {
      readonly ok: true;
      readonly intent: 'close';
      readonly projectId: string;
      readonly closeDate: string;
    }
  | {
      readonly ok: false;
      readonly kind: 'invalid';
      readonly fieldErrors: Partial<Record<ProjectField, string>>;
    }
  /** Nothing saved: these allocations would be trimmed or removed; resubmit with `confirm` (AC-25). */
  | {
      readonly ok: false;
      readonly kind: 'confirm';
      readonly closeDate: string;
      readonly ending: ReadonlyArray<ClosingRow>;
      readonly removed: ReadonlyArray<ClosingRow>;
    }
  | { readonly ok: false; readonly kind: 'error'; readonly error: string };

export const PROJECT_MESSAGE = {
  name: 'Enter a project name',
  nameTooLong: 'A project name is at most 200 characters',
  type: 'Choose a type',
  /** AC-24: names are compared ignoring letter case and surrounding spaces. */
  duplicate: (name: string) => `An open project named “${name}” already exists.`,
  closeDate: 'Enter a date as YYYY-MM-DD',
  closeDateInPast: 'Close date can’t be in the past',
  closed: 'This project is already closed and can’t be reopened.',
  gone: 'This project no longer exists.',
  /** AC-11. */
  closedRule: 'Closed projects accept no new, changed or removed allocations.',
} as const;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** True for a real calendar day written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = utc(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** «2026-12-15» → «15 Dec 2026». */
export function dateText(iso: string): string {
  const date = utc(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** «2026-12-15» → «Tue 15 Dec 2026». */
export const longDateText = (iso: string) => `${DAYS[utc(iso).getUTCDay()]} ${dateText(iso)}`;

/** «2026-12-15» → «15 Dec». */
export const shortDateText = (iso: string) => dateText(iso).split(' ').slice(0, 2).join(' ');

/** «1 allocation» / «3 allocations». */
export const allocations = (n: number) => `${n} ${n === 1 ? 'allocation' : 'allocations'}`;
