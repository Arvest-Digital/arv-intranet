import type { EmployeeRecord } from '@arv/contracts/org';

/** The permission that shows «People» in the navigation and opens the employee records (AC-22). */
export const MANAGE_EMPLOYEE_RECORDS = 'org:manage-employee-records';

/** What the selects post for «No team» / «Not linked». */
export const NONE = 'none';

/** An intranet account a record can be linked to (from the access list). */
export type Login = { readonly id: string; readonly name: string; readonly email: string };

/** The inputs of the record form, as the action names them when a refusal belongs under one. */
export type RecordField =
  | 'fullName'
  | 'teamId'
  | 'contractHours'
  | 'workingDays'
  | 'employmentStart'
  | 'employmentEnd'
  | 'userId';

export type FieldErrors = Partial<Record<RecordField, string>>;

/** A resource-week the change would overbook (AC-19c), ready to list. */
export type OverbookedWeek = {
  readonly employeeName: string;
  readonly weekStart: string;
  readonly overMinutes: number;
};

/** What the employee-record action answers the dialog. */
export type EmployeeRecordActionResult =
  | {
      readonly ok: true;
      readonly id: string;
      readonly fullName: string;
      /** Set when the save gave the record an end date, for the needing-attention note (AC-21). */
      readonly employmentEnd: string | null;
    }
  /** Rule errors under their fields (AC-20, AC-19b); `error` when one belongs to no field. */
  | {
      readonly ok: false;
      readonly kind: 'invalid';
      readonly fieldErrors: FieldErrors;
      readonly error?: string;
    }
  /** Nothing saved: these weeks would become overbooked; resubmit with `confirm` (AC-19c). */
  | { readonly ok: false; readonly kind: 'confirm'; readonly weeks: ReadonlyArray<OverbookedWeek> }
  /** Someone saved the record meanwhile; `current` is what they saved (sad §8 Concurrency). */
  | {
      readonly ok: false;
      readonly kind: 'conflict';
      readonly error: string;
      readonly current: EmployeeRecord;
    }
  | { readonly ok: false; readonly kind: 'error'; readonly error: string };

/** The rule messages the design uses (AC-20, AC-19b). */
export const RULE_MESSAGE = {
  fullName: 'Enter a full name',
  contractHours: 'Contract hours must be more than 0 and at most 60',
  workingDays: 'Select at least one working day',
  endBeforeStart: 'End date is before start date',
  date: 'Enter a date as YYYY-MM-DD',
  loginLinked: (holder: string) => `This login is already linked to ${holder}.`,
  loginGone: 'This login is no longer on the access list.',
  teamGone: 'This team no longer exists.',
} as const;

/** ISO weekdays, 1 = Monday … 7 = Sunday, with the labels the form and the list use. */
export const WEEKDAYS = [
  { day: 1, short: 'Mon', letter: 'M' },
  { day: 2, short: 'Tue', letter: 'T' },
  { day: 3, short: 'Wed', letter: 'W' },
  { day: 4, short: 'Thu', letter: 'T' },
  { day: 5, short: 'Fri', letter: 'F' },
  { day: 6, short: 'Sat', letter: 'S' },
  { day: 7, short: 'Sun', letter: 'S' },
] as const;

/** Hours with at most two decimals and no trailing zeros: 2400 min → «40», 450 → «7.5». */
export const hoursOf = (minutes: number) => String(Math.round((minutes / 60) * 100) / 100);

/** Working days as runs: [1,2,3,5] → «Mon–Wed, Fri». */
export function workingDaysText(days: ReadonlyArray<number>): string {
  const [first, ...rest] = [...days].sort((a, b) => a - b);
  if (first === undefined) return 'No working days';
  const label = (day: number) => WEEKDAYS[day - 1]?.short ?? String(day);
  const runs: string[] = [];
  let start = first;
  let prev = first;
  for (const day of [...rest, Number.NaN]) {
    if (day === prev + 1) {
      prev = day;
      continue;
    }
    runs.push(start === prev ? label(start) : `${label(start)}–${label(prev)}`);
    start = day;
    prev = day;
  }
  return runs.join(', ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A week by its Monday: «W48 · 23 Nov» (ISO week number). */
export function weekLabel(monday: string): string {
  const date = new Date(`${monday}T00:00:00Z`);
  const thursday = new Date(date.getTime() + 3 * 86_400_000);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `W${week} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** A business date for reading: «2026-12-15» → «15 Dec 2026». */
export function dateText(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Up to two initials for the avatar: «Olena Kovalenko» → «OK». */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

/** The part of a login's address before the @, as the list shows it. */
export const loginName = (login: Login) => login.email.split('@')[0] ?? login.email;
