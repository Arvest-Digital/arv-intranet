import { type EmployeeId, requirePermission, UnitOfWork, type UserId } from '@arv/kernel';
import { Array as Arr, Effect, Option } from 'effect';
import type { CalendarDate, IsoWeekday } from '../../domain/calendar';
import {
  checkVersion,
  type EmployeeName,
  type EmployeeRecord,
  EmployeeRecordVersionConflict,
  type EmployeeTerms,
  validateEmployeeTerms,
} from '../../domain/employee-record';
import { CapacityConfirmationRequired, EmployeeRecordNotFound } from '../../domain/errors';
import type { TeamId } from '../../domain/team';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { CapacityImpactCheck, EmployeeRecordRepository } from '../ports';
import { changedBy } from './changed-by';
import { requireLogin, requireTeam } from './references';

/**
 * An edit as the form sends it: fields left out keep their value, `null` clears a nullable one
 * (openapi `EmployeeRecordChange`). Linking or unlinking a login is an edit of `userId`.
 */
export interface EmployeeRecordChange {
  /** The version the form was opened at (sad §8 Concurrency). */
  readonly version: number;
  readonly fullName?: EmployeeName;
  readonly userId?: UserId | null;
  readonly teamId?: TeamId | null;
  readonly contractMinutes?: number | null;
  readonly workingDays?: ReadonlyArray<IsoWeekday>;
  readonly employmentStart?: CalendarDate | null;
  readonly employmentEnd?: CalendarDate | null;
  /** The user saw the capacity warning and confirms it (AC-19c, ADR-0010). */
  readonly confirm?: boolean;
}

/** `change[key]` when the form sent it, else the record's current value. */
const pick = <K extends keyof EmployeeRecordChange & keyof EmployeeRecord>(
  change: EmployeeRecordChange,
  record: EmployeeRecord,
  key: K,
) => (change[key] === undefined ? record[key] : change[key]) as EmployeeRecord[K];

/** Contract hours or working days moved: capacity changes in every week (AC-19, AC-19c). */
const capacityChanged = (record: EmployeeRecord, terms: EmployeeTerms): boolean =>
  record.contractMinutes !== terms.contractMinutes ||
  record.workingDays.join() !== terms.workingDays.join();

/**
 * Flow 9: edits an employee record, including linking or unlinking its login (AC-19, AC-19a).
 *
 * - Missing `org:manage-employee-records` → `PermissionDenied`, nothing read (AC-22).
 * - Gone → `EmployeeRecordNotFound`; opened at an older version → `EmployeeRecordVersionConflict`
 *   carrying the current values and who changed them (sad §8).
 * - Every broken AC-20 rule at once → `InvalidEmployeeRecord`.
 * - A login linked to another record → `LoginAlreadyLinked` naming it (AC-19b).
 * - New contract hours or working days that would overbook a coming week →
 *   `CapacityConfirmationRequired` listing the weeks, unless `confirm` (AC-19c). Allocations are
 *   never touched, so no allocation history is written.
 * - A new employment end date keeps later allocations; scheduling marks them needing attention
 *   on read (AC-21), so nothing else is called.
 */
export const changeEmployeeRecord = (id: EmployeeId, change: EmployeeRecordChange) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_EMPLOYEE_RECORDS);
    const actor = yield* changedBy;
    const records = yield* EmployeeRecordRepository;
    const impact = yield* CapacityImpactCheck;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const found = yield* records.findById(id);
        if (Option.isNone(found)) return yield* new EmployeeRecordNotFound({ id });
        const current = yield* checkVersion(found.value, change.version);

        const terms = yield* validateEmployeeTerms({
          contractMinutes: pick(change, current, 'contractMinutes'),
          workingDays: pick(change, current, 'workingDays'),
          employmentStart: pick(change, current, 'employmentStart'),
          employmentEnd: pick(change, current, 'employmentEnd'),
        });
        const userId = pick(change, current, 'userId');
        const teamId = pick(change, current, 'teamId');
        // Only a newly named team or login is looked up; the current ones were checked when set.
        if (teamId !== current.teamId) yield* requireTeam(teamId);
        if (userId !== current.userId) yield* requireLogin(userId);

        if (change.confirm !== true && capacityChanged(current, terms)) {
          const overbookedWeeks = yield* impact.termsChange(id, terms);
          if (Arr.isNonEmptyReadonlyArray(overbookedWeeks)) {
            return yield* new CapacityConfirmationRequired({ overbookedWeeks });
          }
        }

        const fullName = (change.fullName ?? current.fullName) as EmployeeName;
        const saved = yield* records.update(
          id,
          change.version,
          { ...terms, fullName, userId, teamId },
          actor,
        );
        if (Option.isSome(saved)) return saved.value;

        // No row matched: someone saved or removed it since the read above.
        const latest = yield* records.findById(id);
        if (Option.isNone(latest)) return yield* new EmployeeRecordNotFound({ id });
        return yield* new EmployeeRecordVersionConflict({ current: latest.value });
      }),
    );
  });
