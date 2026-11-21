import { requirePermission, UnitOfWork, type UserId } from '@arv/kernel';
import { Effect } from 'effect';
import {
  type EmployeeName,
  type EmployeeTermsInput,
  validateEmployeeTerms,
} from '../../domain/employee-record';
import type { TeamId } from '../../domain/team';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { EmployeeRecordRepository } from '../ports';
import { changedBy } from './changed-by';
import { requireLogin, requireTeam } from './references';

export interface CreateEmployeeRecordInput extends EmployeeTermsInput {
  readonly fullName: EmployeeName;
  readonly userId: UserId | null;
  readonly teamId: TeamId | null;
}

/**
 * Flow 9, AC-19a: adds a resource's employee record. Every broken AC-20 rule →
 * `InvalidEmployeeRecord`; a login linked elsewhere → `LoginAlreadyLinked` naming that record
 * (AC-19b). Missing contract hours or start date save an incomplete record (AC-06). A new record
 * has no allocations, so there is no capacity check and no confirmation.
 */
export const createEmployeeRecord = (input: CreateEmployeeRecordInput) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_EMPLOYEE_RECORDS);
    const actor = yield* changedBy;
    const terms = yield* validateEmployeeTerms(input);
    const records = yield* EmployeeRecordRepository;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        yield* requireTeam(input.teamId);
        yield* requireLogin(input.userId);
        return yield* records.create(
          { ...terms, fullName: input.fullName, userId: input.userId, teamId: input.teamId },
          actor,
        );
      }),
    );
  });
