import { requirePermission, Today, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import {
  type AllocationId,
  changeFromToday,
  currentSegment,
  type IsoDate,
  type Rate,
  rateOf,
  type Segment,
} from '../../domain/allocation';
import { AllocationNotFound } from '../../domain/errors';
import { changeImpact } from '../../domain/overbooking';
import { EDIT_ALLOCATIONS } from '../../permissions';
import { AllocationHistoryRepository, AllocationRepository } from '../ports';
import { withCurrentValues } from './conflict';
import {
  bookingContext,
  changedBy,
  loadProject,
  loadResource,
  loadSchedule,
  requireConfirmation,
  weeksAround,
} from './context';

/** A change from today as the form sends it; fields left out keep their value (`AllocationChange`). */
export interface AllocationChangeInput {
  /** The version the allocation was opened at (AC-07b). */
  readonly version: number;
  readonly startsOn?: IsoDate;
  readonly endsOn?: IsoDate;
  readonly rateMinutes?: number;
  readonly ratePeriod?: 'day' | 'week';
  /** The user saw the overbooking warning and confirms it (AC-10, ADR-0010). */
  readonly confirm?: boolean;
}

/**
 * The new rate, if the form names one; a field left out keeps the current one. Leave keeps its
 * full-day rate: for leave only the dates change (contract `updateAllocation`).
 */
const newRate = (current: Segment, input: AllocationChangeInput): Rate | undefined => {
  if (input.rateMinutes === undefined && input.ratePeriod === undefined) return undefined;
  const rate = rateOf(current);
  if (rate.ratePeriod === 'full-day') return rate;
  return {
    ratePeriod: input.ratePeriod ?? rate.ratePeriod,
    rateMinutes: input.rateMinutes ?? rate.rateMinutes,
  };
};

/**
 * Flow 5: changes an allocation's hours or dates from today (AC-09b).
 *
 * - Missing `scheduling:edit-allocations` on this call's actor → `PermissionDenied` (AC-12, AC-14).
 * - Gone → `AllocationNotFound`; opened at an older version, or changed between the read and the
 *   write → `AllocationChangedMeanwhile` with the current values (AC-07b).
 * - Closed project → `ProjectClosed` (AC-11); every broken rule → `AllocationRulesBroken`, including
 *   a change that leaves it running past the employment end date (AC-13, AC-21b).
 * - Hours that grow into an overbooked week or onto leave days → `OverbookingConfirmationRequired`,
 *   unless `confirm` (AC-10); shrinking never asks.
 * - Otherwise stores the segments and a `changed` history entry effective today in one unit of work.
 */
export const changeAllocation = (id: AllocationId, input: AllocationChangeInput) =>
  Effect.gen(function* () {
    yield* requirePermission(EDIT_ALLOCATIONS);
    const actor = yield* changedBy;
    const allocations = yield* AllocationRepository;
    const history = yield* AllocationHistoryRepository;
    const today = yield* (yield* Today).date;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const found = yield* allocations.findById(id);
        if (Option.isNone(found)) return yield* new AllocationNotFound({ allocationId: id });
        const { allocation } = found.value;

        const project = yield* loadProject(allocation.projectId);
        const dates = allocation.segments.flatMap((s) => [s.startsOn, s.endsOn]);
        const window = weeksAround(
          [today, ...dates, input.startsOn, input.endsOn].filter(
            (d): d is IsoDate => d !== undefined,
          ),
        );
        const facts = yield* loadResource(allocation.employeeId, window);

        const rate = newRate(currentSegment(allocation, today), input);
        const update = yield* changeFromToday(
          allocation,
          input.version,
          {
            ...(input.startsOn === undefined ? {} : { startsOn: input.startsOn }),
            ...(input.endsOn === undefined ? {} : { endsOn: input.endsOn }),
            ...(rate === undefined ? {} : { rate }),
          },
          bookingContext(today, facts, project),
        );
        const segments = update.segments as [Segment, ...Segment[]];

        const schedule = yield* loadSchedule(allocation.employeeId, window, facts, id);
        const current = { id, projectId: allocation.projectId, segments: allocation.segments };
        const proposed = { id, projectId: allocation.projectId, segments };
        yield* requireConfirmation(
          changeImpact(schedule, current, proposed, facts.holidays, today),
          input.confirm,
        );

        const saved = yield* allocations.update(id, input.version, segments, actor);
        yield* history.append({
          allocationId: id,
          employeeId: allocation.employeeId,
          projectId: allocation.projectId,
          entry: update.history,
          changedBy: actor,
        });
        return saved;
      }).pipe(Effect.catchTag('AllocationVersionConflict', withCurrentValues(id))),
    );
  });
