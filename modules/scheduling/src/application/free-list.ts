import { type EmployeeId, Today } from '@arv/kernel';
import { OrgApi, type TeamId } from '@arv/org';
import { Effect } from 'effect';
import { FreeListQueryInvalid, type FreeListQueryIssue } from '../domain/errors';
import {
  type FreeList,
  type FreeListCandidate,
  freeList,
  freeListPeriod,
} from '../domain/free-list';
import { TICKS_PER_HOUR, type Ticks } from '../domain/ticks';
import { employmentEndView } from '../domain/visibility';
import { termsOf } from './allocations/context';
import { AllocationRepository } from './ports';
import { requireBoardViewer } from './viewer';

/** N weeks, 1 to 12 (AC-05). */
export const FREE_LIST_MAX_WEEKS = 12;

/** The AC-05 wording, shown with no results. */
export const FREE_LIST_QUERY_MESSAGE =
  'The number of weeks must be from 1 to 12 and the free hours must be zero or more';

/** «At least X free hours over the next N weeks» (AC-04). */
export interface FreeListQuery {
  readonly weeks: number;
  readonly minFreeHours: number;
}

/** A resource in the free list: no employment end or other terms, so nothing to redact (AC-22). */
export interface FreeListResource {
  readonly employeeId: EmployeeId;
  readonly fullName: string;
  readonly teamId: TeamId | null;
}

/** AC-05: weeks a whole number from 1 to 12, free hours a number of zero or more. */
const validate = (query: FreeListQuery): Effect.Effect<void, FreeListQueryInvalid> => {
  const issues: FreeListQueryIssue[] = [];
  if (!Number.isInteger(query.weeks) || query.weeks < 1 || query.weeks > FREE_LIST_MAX_WEEKS) {
    issues.push({ path: 'weeks', message: 'Expected a number between 1 and 12' });
  }
  if (!Number.isFinite(query.minFreeHours) || query.minFreeHours < 0) {
    issues.push({ path: 'minFreeHours', message: 'Expected a number of zero or more' });
  }
  const [first, ...rest] = issues;
  return first === undefined
    ? Effect.void
    : Effect.fail(
        new FreeListQueryInvalid({ message: FREE_LIST_QUERY_MESSAGE, issues: [first, ...rest] }),
      );
};

/**
 * Flow 4: who has at least `minFreeHours` free over the rest of this week from today plus the
 * next N−1 full weeks, most free first (AC-04, AC-05, AC-06, AC-12b, AC-21b, AC-22).
 *
 * - Neither view-whole-board nor edit-allocations → `PermissionDenied`, nothing read.
 * - Weeks outside 1 to 12, or free hours negative or not a number → `FreeListQueryInvalid`.
 * - Overbooked weeks and weeks needing attention count zero; incomplete records are left out and
 *   listed apart (AC-06). Past an employment end the viewer may not see, only zero capacity
 *   counts, so the end does not leak through the figures (AC-22).
 */
export const getFreeList = (query: FreeListQuery) =>
  Effect.gen(function* () {
    const { viewer } = yield* requireBoardViewer;
    yield* validate(query);
    const today = yield* (yield* Today).date;
    const org = yield* OrgApi;
    const allocations = yield* AllocationRepository;

    const period = freeListPeriod(today, query.weeks);
    const { resources, holidays } = yield* org.employedIn(period);
    const inPeriod =
      resources.length === 0
        ? []
        : yield* allocations.listInWindow(period, {
            employeeIds: resources.map((r) => r.employeeId),
          });

    const candidates = resources.map(
      (resource): FreeListCandidate<FreeListResource> => ({
        resource: {
          employeeId: resource.employeeId,
          fullName: resource.fullName,
          teamId: resource.teamId,
        },
        terms: termsOf(resource),
        allocations: inPeriod.filter((a) => a.employeeId === resource.employeeId),
        visibility: employmentEndView(viewer, resource.employmentEnd),
      }),
    );
    // Ticks are whole numbers, so «at least X hours» is «at least ⌈X hours⌉ ticks».
    const minFree = Math.ceil(query.minFreeHours * TICKS_PER_HOUR) as Ticks;
    const result: FreeList<FreeListResource> = freeList(
      candidates,
      new Set(holidays.map((h) => h.holidayDate)),
      today,
      query.weeks,
      minFree,
    );
    return result;
  });
