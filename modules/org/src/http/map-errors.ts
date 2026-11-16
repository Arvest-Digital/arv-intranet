import { EmployeeId } from '@arv/kernel';
import { Effect } from 'effect';
import { describeEmployeeRecord, employeeRefs } from '../application/employee-records';
import {
  capacityConfirmationRequired,
  type DescribedOrgError,
  employeeRecordVersionConflict,
  isDescribedOrgError,
  isOrgError,
  loginAlreadyLinked,
  type OrgError,
  toOrgContractError,
} from './presenter';

/** Looks up the names a richer failure's body shows, then fails with its contract error. */
const describeFailure = (error: DescribedOrgError) =>
  Effect.gen(function* () {
    switch (error._tag) {
      case 'LoginAlreadyLinked': {
        const id = EmployeeId.make(error.employeeId);
        const refs = yield* employeeRefs([id]);
        return yield* Effect.fail(
          loginAlreadyLinked(refs.get(id) ?? { id, fullName: error.fullName, team: null }),
        );
      }
      case 'EmployeeRecordVersionConflict':
        return yield* Effect.fail(
          employeeRecordVersionConflict(yield* describeEmployeeRecord(error.current)),
        );
      case 'CapacityConfirmationRequired': {
        const weeks = error.overbookedWeeks;
        const refs = yield* employeeRefs(weeks.map((w) => EmployeeId.make(w.employeeId)));
        return yield* Effect.fail(capacityConfirmationRequired(weeks, refs));
      }
    }
  });

/**
 * Maps org's domain failures to contract errors and lets every other failure through (the
 * kernel's access errors, which `runEffect` maps once).
 */
export const mapOrgErrors = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.catchAll(effect, (error) =>
    Effect.gen(function* () {
      if (isDescribedOrgError(error)) return yield* describeFailure(error);
      return yield* Effect.fail(
        isOrgError(error)
          ? toOrgContractError(error)
          : (error as Exclude<E, OrgError | DescribedOrgError>),
      );
    }),
  );
