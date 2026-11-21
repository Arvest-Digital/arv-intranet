import { type EmployeeId, type ProjectId, requirePermission, Today, UnitOfWork } from '@arv/kernel';
import { Effect } from 'effect';
import { createAllocation as create, type IsoDate, type Segment } from '../../domain/allocation';
import { allocationImpact } from '../../domain/overbooking';
import { EDIT_ALLOCATIONS } from '../../permissions';
import { AllocationHistoryRepository, AllocationRepository } from '../ports';
import {
  bookingContext,
  changedBy,
  loadProject,
  loadResource,
  loadSchedule,
  requireConfirmation,
  weeksAround,
} from './context';

/** A new work allocation as the form sends it (contract `AllocationCreate`). */
export interface AllocationCreateInput {
  readonly employeeId: EmployeeId;
  readonly projectId: ProjectId;
  readonly startsOn: IsoDate;
  readonly endsOn: IsoDate;
  readonly rateMinutes: number;
  readonly ratePeriod: 'day' | 'week';
  /** The user saw the overbooking warning and confirms it (AC-10, ADR-0010). */
  readonly confirm?: boolean;
}

/**
 * Critical flow 1: allocates a resource to a project (AC-07).
 *
 * - Missing `scheduling:edit-allocations` on this call's actor → `PermissionDenied`, nothing read
 *   (AC-12, AC-14).
 * - Unknown project or resource → `ProjectNotFound` / `EmployeeRecordNotFound`.
 * - Closed project → `ProjectClosed` (AC-11); every broken rule at once → `AllocationRulesBroken`
 *   (AC-09, AC-09b, AC-13).
 * - Overbooked weeks or work on leave days → `OverbookingConfirmationRequired`, unless `confirm`
 *   (AC-10, AC-15).
 * - Otherwise stores the allocation and its `created` history entry in one unit of work, stamped
 *   with the actor as last changed by (AC-07).
 */
export const createAllocation = (input: AllocationCreateInput) =>
  Effect.gen(function* () {
    yield* requirePermission(EDIT_ALLOCATIONS);
    const actor = yield* changedBy;
    const allocations = yield* AllocationRepository;
    const history = yield* AllocationHistoryRepository;
    const today = yield* (yield* Today).date;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const project = yield* loadProject(input.projectId);
        const window = weeksAround([input.startsOn, input.endsOn]);
        const facts = yield* loadResource(input.employeeId, window);

        const update = yield* create(
          input.projectId,
          {
            startsOn: input.startsOn,
            endsOn: input.endsOn,
            rateMinutes: input.rateMinutes,
            ratePeriod: input.ratePeriod,
          },
          bookingContext(today, facts, project),
        );
        const segments = update.segments as [Segment, ...Segment[]];

        const schedule = yield* loadSchedule(input.employeeId, window, facts, null);
        const proposed = { id: null, projectId: input.projectId, segments };
        yield* requireConfirmation(
          allocationImpact(schedule, proposed, facts.holidays, today),
          input.confirm,
        );

        const saved = yield* allocations.insert(
          { employeeId: input.employeeId, projectId: input.projectId, segments },
          actor,
        );
        yield* history.append({
          allocationId: saved.allocation.id,
          employeeId: input.employeeId,
          projectId: input.projectId,
          entry: update.history,
          changedBy: actor,
        });
        return saved;
      }),
    );
  });
