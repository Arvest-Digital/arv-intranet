import type { OverbookedWeek } from './employee-record';

/** The permission that adds and removes public holidays (AC-28); anyone signed in reads them. */
export const MANAGE_HOLIDAY_LIST = 'org:manage-holiday-list';

/** The permission named on the refusal screen (AC-28). */
export const MANAGE_HOLIDAY_LIST_LABEL = 'manage holiday list';

/** The holiday form's fields, as the action names them when a refusal belongs under one. */
export type HolidayField = 'holidayDate' | 'name';

/** What the holidays action answers the page. */
export type HolidayActionResult =
  | { readonly ok: true; readonly intent: 'add' | 'remove'; readonly holidayDate?: string }
  | {
      readonly ok: false;
      readonly kind: 'invalid';
      readonly fieldErrors: Partial<Record<HolidayField, string>>;
      readonly error?: string;
    }
  /** Nothing saved: these weeks would become overbooked; resubmit with `confirm` (AC-19c, AC-27). */
  | { readonly ok: false; readonly kind: 'confirm'; readonly weeks: ReadonlyArray<OverbookedWeek> }
  | { readonly ok: false; readonly kind: 'error'; readonly error: string };

export const HOLIDAY_MESSAGE = {
  date: 'Enter a date as YYYY-MM-DD',
  name: 'Enter a holiday name',
  nameTooLong: 'A holiday name is at most 100 characters',
  duplicate: (date: string) => `${date} is already a public holiday`,
  gone: 'This holiday was already removed.',
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

/** «2026-12-25» → «Fri 2026-12-25», as the holiday list shows a date. */
export const holidayDateText = (iso: string) => `${DAYS[utc(iso).getUTCDay()]} ${iso}`;

/** «2026-12-25» → «Fri 25 Dec 2026», under the date input and in the confirm dialog. */
export function longDateText(iso: string): string {
  const date = utc(iso);
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The years the page offers: last year, this year and next year, plus the one shown. */
export function yearChoices(current: number, shown: number): ReadonlyArray<number> {
  return [...new Set([current - 1, current, current + 1, shown])].sort((a, b) => a - b);
}

/** `?year=2027` when it is a plausible year, else this year. */
export function yearOf(url: URL, today: Date): number {
  const year = Number(url.searchParams.get('year'));
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : today.getUTCFullYear();
}
