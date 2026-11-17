import { requirePermission, Today, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import {
  type AllocationId,
  type IsoDate,
  type RemovalOutcome,
  removeFromToday,
  type Segment,
} from '../../domain/allocation';
import { AllocationNotFound } from '../../domain/errors';
import { EDIT_ALLOCATIONS } from '../../permissions';
import { AllocationHistoryRepository, AllocationRepository } from '../ports';
import { withCurrentValues } from './conflict';
import { changedBy, loadProject } from './context';

/** What a removal did (contract `AllocationRemoval`). */
export interface AllocationRemoved {
  readonly allocationId: AllocationId;
  readonly outcome: RemovalOutcome;
  /** The new last day for `ended` (yesterday); null for `deleted`. */
  readonly endsOn: IsoDate | null;
}

/**
 * Flow 5: removes an allocation from today (AC-07a, AC-09b). Days before today stay booked: one
 * that started before today ends yesterday (`ended`), one that starts today or later is deleted.
 * Either way a `removed` history entry is written by the remover and outlives the allocation.
 *
 * - Missing `scheduling:edit-allocations` on this call's actor → `PermissionDenied` (AC-12, AC-14).
 * - Gone → `AllocationNotFound`; stale `version` → `AllocationChangedMeanwhile` (AC-07b).
 * - Closed project → `ProjectClosed` (AC-11). Allowed past the employment end date (AC-21b).
 */
export const removeAllocation = (id: AllocationId, version: number) =>
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

        const removal = yield* removeFromToday(allocation, version, {
          today,
          projectCloseDate: project.closeDate,
        });
        const [first, ...rest] = removal.segments;
        if (first === undefined) {
          yield* allocations.delete(id, version);
        } else {
          yield* allocations.update(
            id,
            version,
            [first, ...rest] as [Segment, ...Segment[]],
            actor,
          );
        }
        yield* history.append({
          allocationId: id,
          employeeId: allocation.employeeId,
          projectId: allocation.projectId,
          entry: removal.history,
          changedBy: actor,
        });
        const removed: AllocationRemoved = {
          allocationId: id,
          outcome: removal.outcome,
          endsOn: removal.segments.at(-1)?.endsOn ?? null,
        };
        return removed;
      }).pipe(Effect.catchTag('AllocationVersionConflict', withCurrentValues(id))),
    );
  });
