import { Effect, Option } from 'effect';
import type { AllocationId } from '../../domain/allocation';
import { AllocationNotFound, type AllocationVersionConflict } from '../../domain/errors';
import { AllocationChangedMeanwhile } from '../errors';
import { AllocationRepository } from '../ports';

/**
 * AC-07b: turns a stale version — seen by the domain or by the guarded write — into
 * `AllocationChangedMeanwhile` carrying the current values and who changed them; an allocation
 * removed meanwhile becomes `AllocationNotFound`. Use with
 * `Effect.catchTag('AllocationVersionConflict', withCurrentValues(id))`.
 */
export const withCurrentValues =
  (id: AllocationId) =>
  (
    conflict: AllocationVersionConflict,
  ): Effect.Effect<never, AllocationChangedMeanwhile | AllocationNotFound, AllocationRepository> =>
    Effect.gen(function* () {
      const current = yield* (yield* AllocationRepository).findById(id);
      if (Option.isNone(current)) return yield* new AllocationNotFound({ allocationId: id });
      return yield* new AllocationChangedMeanwhile({
        expectedVersion: conflict.expectedVersion,
        current: current.value,
      });
    });
