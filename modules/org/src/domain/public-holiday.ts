import { Schema } from 'effect';
import { CalendarDate } from './calendar';
import { trimmedName } from './name';

export const HOLIDAY_NAME_MAX_LENGTH = 100;

/** A public holiday's id; used only inside `org`. */
export const PublicHolidayId = Schema.UUID.pipe(Schema.brand('PublicHolidayId'));
export type PublicHolidayId = typeof PublicHolidayId.Type;

/** A holiday's display label: trimmed, non-empty, at most 100 characters. Decoding trims. */
export const HolidayName = trimmedName(HOLIDAY_NAME_MAX_LENGTH, 'HolidayName');
export type HolidayName = typeof HolidayName.Type;

/**
 * A company-wide non-working date on the single holiday list (US-09). One per date; removal is a
 * hard delete. Capacity skips it for every resource whose working day it falls on (AC-27).
 */
export class PublicHoliday extends Schema.Class<PublicHoliday>('PublicHoliday')({
  id: PublicHolidayId,
  holidayDate: CalendarDate,
  name: Schema.String,
  createdAt: Schema.DateFromSelf,
}) {}
