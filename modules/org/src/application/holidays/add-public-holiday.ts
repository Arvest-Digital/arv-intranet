import { requirePermission, UnitOfWork } from '@arv/kernel';
import { Array as Arr, Effect } from 'effect';
import type { CalendarDate } from '../../domain/calendar';
import { CapacityConfirmationRequired, DuplicateHolidayDate } from '../../domain/errors';
import type { HolidayName } from '../../domain/public-holiday';
import { MANAGE_HOLIDAY_LIST } from '../../permissions';
import { CapacityImpactCheck, PublicHolidayRepository } from '../ports';

export interface AddPublicHolidayInput {
  readonly holidayDate: CalendarDate;
  readonly name: HolidayName;
  /** The user saw the capacity warning and confirms it (AC-19c, AC-27, ADR-0010). */
  readonly confirm?: boolean;
}

/**
 * Flow 12, AC-27: adds a date to the single company holiday list.
 *
 * - Missing `org:manage-holiday-list` → `PermissionDenied`, list unchanged (AC-28).
 * - The date is already on the list → `DuplicateHolidayDate`, checked before the warning so the
 *   user is never asked to confirm a holiday that can't be saved.
 * - The holiday would overbook a coming week of a resource who works that weekday →
 *   `CapacityConfirmationRequired` listing the weeks, unless `confirm` (AC-19c).
 * - Allocations are never touched, so no allocation history is written.
 */
export const addPublicHoliday = (input: AddPublicHolidayInput) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_HOLIDAY_LIST);
    const holidays = yield* PublicHolidayRepository;
    const impact = yield* CapacityImpactCheck;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const sameDate = yield* holidays.listInRange(input.holidayDate, input.holidayDate);
        if (Arr.isNonEmptyReadonlyArray(sameDate)) {
          return yield* new DuplicateHolidayDate({ holidayDate: input.holidayDate });
        }

        if (input.confirm !== true) {
          const overbookedWeeks = yield* impact.holidayAdded(input.holidayDate);
          if (Arr.isNonEmptyReadonlyArray(overbookedWeeks)) {
            return yield* new CapacityConfirmationRequired({ overbookedWeeks });
          }
        }

        return yield* holidays.create({ holidayDate: input.holidayDate, name: input.name });
      }),
    );
  });
