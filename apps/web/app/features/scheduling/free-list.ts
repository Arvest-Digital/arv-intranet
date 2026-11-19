import type { EmployeeRef } from '@arv/contracts/org';
import type { FreeList } from '@arv/contracts/scheduling';
import { dayMonth, hours, isoWeek } from './board';

/** What the drawer shows: the list, the AC-05 message, or a failure that leaves the board usable. */
export type FreeListResult =
  | { readonly kind: 'list'; readonly list: FreeList }
  | {
      readonly kind: 'invalid';
      readonly message: string;
      /** The query fields the api named (`weeks`, `minFreeHours`), to mark as invalid. */
      readonly fields: ReadonlyArray<string>;
    }
  | { readonly kind: 'error'; readonly message: string };

export type FreeListRow = {
  readonly employee: EmployeeRef;
  /** «24h». */
  readonly total: string;
  readonly weeks: ReadonlyArray<{
    readonly weekStart: string;
    readonly label: string;
    readonly free: string;
  }>;
};

/**
 * One row per resource, most free first (AC-04); people with the same total by name. The api
 * already sorts; sorting again keeps the order right whatever the order on the wire.
 */
export function freeListRows(list: FreeList): ReadonlyArray<FreeListRow> {
  return [...list.items]
    .sort(
      (a, b) =>
        b.freeMinutesTotal - a.freeMinutesTotal ||
        a.employee.fullName.localeCompare(b.employee.fullName, 'en'),
    )
    .map((item) => ({
      employee: item.employee,
      total: `${hours(item.freeMinutesTotal)}h`,
      weeks: item.freeMinutesPerWeek.map((week) => ({
        weekStart: week.weekStart,
        label: `W${isoWeek(week.weekStart)}`,
        free: `${hours(week.minutes)}h`,
      })),
    }));
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** «Wed 18 Nov». */
export function weekdayDayMonth(iso: string): string {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[dow]} ${dayMonth(iso)}`;
}

/**
 * «Counts from today (Wed 18 Nov) to the end of W48 · All teams»: the period starts today and the
 * board's window and filters do not apply to it (AC-04).
 */
export function freeListNote(list: FreeList): string {
  const last = list.weeks[list.weeks.length - 1] ?? list.from;
  return `Counts from today (${weekdayDayMonth(list.from)}) to the end of W${isoWeek(last)} · All teams`;
}

/** «18 Nov – 29 Nov»: the period an «Allocate» from the list starts with. */
export const freePeriod = (list: FreeList) => `${dayMonth(list.from)} – ${dayMonth(list.to)}`;

/** «Nobody has 16 free hours in the next 2 weeks.» */
export function nobodyText(minFreeHours: number, weeks: number): string {
  const h = hours(minFreeHours * 60);
  return `Nobody has ${h} free hours ${weeks === 1 ? 'this week' : `in the next ${weeks} weeks`}.`;
}
