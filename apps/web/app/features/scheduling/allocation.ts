import type { AllocationRule, BoardAllocation, WorkRatePeriod } from '@arv/contracts/scheduling';
import { dayMonth, isIsoDate } from './board';

// The allocation dialog's model (T41): what the board action answers, the field errors it maps the
// api's rule violations to (AC-09, AC-09b, AC-13, AC-21b), and the values the form opens with.

/** The fields a refusal can sit under. */
export type AllocationField = 'employeeId' | 'projectId' | 'startsOn' | 'endsOn' | 'rate';
export type FieldErrors = Partial<Record<AllocationField, ReadonlyArray<string>>>;

/** A week the save would overbook (AC-10), in exact minutes. */
export type OverWeek = {
  readonly weekStart: string;
  readonly capacityMinutes: number;
  readonly allocatedMinutes: number;
  readonly overMinutes: number;
};

/** A work allocation with hours on leave days (AC-15). */
export type OnLeave = {
  readonly projectId: string;
  readonly projectName: string;
  readonly days: ReadonlyArray<string>;
};

/** An allocation's values as the conflict view compares them (AC-07b). */
export type AllocationValues = {
  readonly projectName: string;
  readonly startsOn: string;
  readonly endsOn: string;
  /** Null for leave (`full-day`). */
  readonly rateMinutes: number | null;
  readonly ratePeriod: 'day' | 'week' | 'full-day';
};

/** What the board's allocation action answers the dialog. */
export type AllocationActionResult =
  | {
      readonly ok: true;
      readonly intent: 'create' | 'change' | 'leave';
      readonly allocationId: string;
    }
  | {
      readonly ok: true;
      readonly intent: 'remove';
      readonly outcome: 'ended' | 'deleted';
      readonly endsOn: string | null;
    }
  /** Broken rules, each under its field (AC-09, AC-13); `error` for one that has no field. */
  | {
      readonly ok: false;
      readonly kind: 'invalid';
      readonly fieldErrors: FieldErrors;
      readonly error?: string;
    }
  /** Nothing saved: these weeks would be overbooked; resubmit with `confirm` (AC-10, ADR-0010). */
  | {
      readonly ok: false;
      readonly kind: 'confirm';
      readonly weeks: ReadonlyArray<OverWeek>;
      readonly onLeave: ReadonlyArray<OnLeave>;
    }
  /** Nothing saved: someone else changed it meanwhile; these are its current values (AC-07b). */
  | {
      readonly ok: false;
      readonly kind: 'conflict';
      readonly message: string;
      readonly version: number;
      readonly changedBy: string;
      readonly changedAt: string;
      readonly current: AllocationValues;
    }
  /** The project is closed (AC-11), the permission is missing (AC-12), it is gone, … */
  | { readonly ok: false; readonly kind: 'error'; readonly error: string };

export const ALLOCATION_MESSAGE = {
  employee: 'Choose a person',
  project: 'Choose an open project',
  leaveType: 'Choose a leave type',
  date: 'Enter a date as YYYY-MM-DD',
  rate: 'Enter the hours',
  quarter: 'Hours must be a multiple of 0.25',
  positive: 'Hours must be more than 0',
  /** AC-09: the rules the input breaks, in the user's words. */
  rules: {
    end_before_start: 'End date is before start date',
    hours_over_24_per_day: 'More than 24h per day',
    hours_over_24_per_working_day: 'More than 24h for each working day of the week',
    starts_before_today: 'Past plans are not rewritten — choose a start date from today.',
    ends_before_today: 'This allocation has ended. Past plans are not rewritten.',
    not_a_leave_project: 'Leave is booked with «Book leave».',
  } satisfies Partial<Record<AllocationRule, string>>,
  /** AC-13: naming the last date the resource can be allocated. */
  outsideEmployment: (last: string | null) =>
    last
      ? `The range ends after the employment period — the last date to allocate is ${longDate(last)}.`
      : 'The range falls outside the employment period.',
  pastClose: (last: string | null) =>
    last
      ? `The project closes after ${longDate(last)} — end the allocation by then.`
      : 'The range runs past the project’s close date.',
  /** AC-11. */
  closed: (project: string) =>
    `${project} is closed and accepts no new, changed or removed allocations.`,
  /** AC-12. */
  forbidden: 'You lack the permission to edit allocations. Nothing was changed.',
  gone: 'This allocation no longer exists. Close the dialog to see the current board.',
} as const;

/** Where each broken rule is shown. */
const RULE_FIELD: Record<AllocationRule, AllocationField> = {
  end_before_start: 'endsOn',
  hours_over_24_per_day: 'rate',
  hours_over_24_per_working_day: 'rate',
  starts_before_today: 'startsOn',
  ends_before_today: 'endsOn',
  outside_employment_period: 'endsOn',
  past_project_close_date: 'endsOn',
  close_date_before_today: 'endsOn',
  not_a_leave_project: 'projectId',
};

/** Every broken rule under its field, with the last bookable date where it names one (AC-09, AC-13). */
export function ruleErrors(
  rules: ReadonlyArray<AllocationRule>,
  lastBookableDate: string | null,
): FieldErrors {
  const errors: Partial<Record<AllocationField, string[]>> = {};
  for (const rule of rules) {
    const message =
      rule === 'outside_employment_period'
        ? ALLOCATION_MESSAGE.outsideEmployment(lastBookableDate)
        : rule === 'past_project_close_date' || rule === 'close_date_before_today'
          ? ALLOCATION_MESSAGE.pastClose(lastBookableDate)
          : ALLOCATION_MESSAGE.rules[rule];
    const field = RULE_FIELD[rule];
    const list = errors[field] ?? [];
    if (!list.includes(message)) list.push(message);
    errors[field] = list;
  }
  return errors;
}

/** The form's hours, checked as the api will (AC-09); minutes when they pass. */
export function parseRate(
  raw: string,
  period: WorkRatePeriod,
): { ok: true; minutes: number } | { ok: false; errors: ReadonlyArray<string> } {
  const text = raw.trim();
  if (text === '') return { ok: false, errors: [ALLOCATION_MESSAGE.rate] };
  const h = Number(text);
  if (!Number.isFinite(h)) return { ok: false, errors: [ALLOCATION_MESSAGE.rate] };
  const errors: string[] = [];
  if (h <= 0) errors.push(ALLOCATION_MESSAGE.positive);
  if (Math.abs(h * 4 - Math.round(h * 4)) > 1e-9) errors.push(ALLOCATION_MESSAGE.quarter);
  if (period === 'day' && h > 24) errors.push(ALLOCATION_MESSAGE.rules.hours_over_24_per_day);
  if (period === 'week' && h > 168) {
    errors.push(ALLOCATION_MESSAGE.rules.hours_over_24_per_working_day);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, minutes: Math.round(h * 60) };
}

/** The dates, checked before they reach the api (AC-09). */
export function dateErrors(startsOn: string, endsOn: string): FieldErrors {
  return {
    ...(isIsoDate(startsOn) ? {} : { startsOn: [ALLOCATION_MESSAGE.date] }),
    ...(isIsoDate(endsOn)
      ? isIsoDate(startsOn) && endsOn < startsOn
        ? { endsOn: [ALLOCATION_MESSAGE.rules.end_before_start] }
        : {}
      : { endsOn: [ALLOCATION_MESSAGE.date] }),
  };
}

/** «20h / week», «8h / day», «Full days». */
export function rateText(rateMinutes: number | null, ratePeriod: AllocationValues['ratePeriod']) {
  if (ratePeriod === 'full-day' || rateMinutes === null) return 'Full days';
  const h = rateMinutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')}h / ${ratePeriod}`;
}

/** Hours as the rate input shows them: «20», «7.5», «7.25». */
export const rateHours = (rateMinutes: number) => String(rateMinutes / 60);

/** «15 Dec 2026». */
export const longDate = (iso: string) => `${dayMonth(iso)} ${iso.slice(0, 4)}`;

/** The day before `iso`. */
export const dayBefore = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** «18 Nov 2026, 14:32» in UTC, as the history shows it. */
export function changedAtText(at: Date | string): string {
  const iso = (typeof at === 'string' ? new Date(at) : at).toISOString();
  return `${longDate(iso.slice(0, 10))}, ${iso.slice(11, 16)}`;
}

/** The first name, for sentences: «Olena». */
export const firstName = (fullName: string) => fullName.split(/\s+/)[0] ?? fullName;

/** An allocation's whole span and the terms in force today (or the next ones, or the last). */
export function allocationTerms(allocation: BoardAllocation, today: string) {
  const segments = allocation.segments;
  const first = segments[0];
  const last = segments[segments.length - 1];
  const current =
    segments.find((s) => s.startsOn <= today && today <= s.endsOn) ??
    segments.find((s) => s.startsOn > today) ??
    last;
  return {
    startsOn: first?.startsOn ?? today,
    endsOn: last?.endsOn ?? today,
    rateMinutes: current?.rateMinutes ?? null,
    ratePeriod: current?.ratePeriod ?? 'week',
    /** Started before today: the start can't change and a change applies from today (AC-09b). */
    started: (first?.startsOn ?? today) < today,
    /** Ended before today: nothing about it can change (AC-09b). */
    ended: (last?.endsOn ?? today) < today,
  };
}

/** An allocation as the dialogs show it, with the person it belongs to. */
export type AllocationTarget = {
  readonly allocation: BoardAllocation;
  readonly employeeName: string;
  /** The person's employment end, when the viewer may see it (AC-21b). */
  readonly employmentEnd: string | null;
};
