import { type EmployeeId, type ProjectId, requirePermission, Today, UnitOfWork } from '@arv/kernel';
import { Effect } from 'effect';
import { bookLeave as book, type IsoDate, type Segment } from '../domain/allocation';
import { allocationImpact } from '../domain/overbooking';
import { EDIT_ALLOCATIONS } from '../permissions';
import {
  bookingContext,
  changedBy,
  loadProject,
  loadResource,
  loadSchedule,
  requireConfirmation,
  weeksAround,
} from './allocations/context';
import { AllocationHistoryRepository, AllocationRepository } from './ports';

/** Leave as the form sends it, in whole working days (contract `LeaveBooking`). */
export interface LeaveBookingInput {
  readonly employeeId: EmployeeId;
  /** An open leave-type project; its name is the leave type (AC-15). */
  readonly projectId: ProjectId;
  readonly startsOn: IsoDate;
  readonly endsOn: IsoDate;
  /** The user saw the work on leave days or the overbooked weeks and confirms (AC-15, ADR-0010). */
  readonly confirm?: boolean;
}

/**
 * Flow 6: books a resource's leave as a `full-day` allocation to a leave-type project (AC-15):
 * each working day of the period takes the resource's full daily capacity.
 *
 * - Missing `scheduling:edit-allocations` on this call's actor → `PermissionDenied`, nothing read
 *   (AC-12, AC-14).
 * - Unknown project or resource → `ProjectNotFound` / `EmployeeRecordNotFound`.
 * - Every broken rule at once → `AllocationRulesBroken`: a project that is not of the `leave` type
 *   (`not_a_leave_project`), a start before today (AC-09b), outside the employment period (AC-13)
 *   or past the project's close date; a closed leave project → `ProjectClosed` (AC-11).
 * - Work allocations with hours on the leave days, even when the week stays within capacity, or
 *   overbooked weeks → `OverbookingConfirmationRequired` naming them, unless `confirm` (AC-15).
 * - Otherwise stores the leave allocation and its `created` history entry in one unit of work.
 */
export const bookLeave = (input: LeaveBookingInput) =>
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

        const update = yield* book(
          input.projectId,
          project.type === 'leave',
          { startsOn: input.startsOn, endsOn: input.endsOn },
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
