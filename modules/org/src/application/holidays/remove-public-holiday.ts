import { requirePermission } from '@arv/kernel';
import { Effect } from 'effect';
import { PublicHolidayNotFound } from '../../domain/errors';
import type { PublicHolidayId } from '../../domain/public-holiday';
import { MANAGE_HOLIDAY_LIST } from '../../permissions';
import { PublicHolidayRepository } from '../ports';

/**
 * Flow 12, US-09: removes a holiday from the list. A removal only adds capacity, so there is no
 * warning. Missing `org:manage-holiday-list` → `PermissionDenied` (AC-28); gone →
 * `PublicHolidayNotFound`.
 */
export const removePublicHoliday = (id: PublicHolidayId) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_HOLIDAY_LIST);
    const holidays = yield* PublicHolidayRepository;
    if (!(yield* holidays.delete(id))) return yield* new PublicHolidayNotFound({ id });
  });
