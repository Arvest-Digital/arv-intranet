import { Data } from 'effect';
import type { StoredAllocation } from './ports';

/**
 * `scheduling.version_conflict` (AC-07b): the allocation was changed since the user opened it at
 * `expectedVersion`. Carries the current values and who changed them, so the second user sees the
 * first user's change. Nothing was saved.
 */
export class AllocationChangedMeanwhile extends Data.TaggedError('AllocationChangedMeanwhile')<{
  readonly expectedVersion: number;
  readonly current: StoredAllocation;
}> {}
