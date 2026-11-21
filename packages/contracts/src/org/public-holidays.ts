import { Schema } from 'effect';
import { pageQueryWith } from '../shared/page';
import { IsoDate, strict } from './values';

/** A date on the single company holiday list (OpenAPI `PublicHoliday`, US-09). */
export const PublicHoliday = Schema.Struct({
  id: Schema.UUID,
  holidayDate: IsoDate,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  createdAt: Schema.Date,
});
export type PublicHoliday = typeof PublicHoliday.Type;
export type PublicHolidayEncoded = typeof PublicHoliday.Encoded;

/** `listPublicHolidays` 200: a cursor page ordered by date. */
export const PublicHolidayPage = Schema.Struct({
  items: Schema.Array(PublicHoliday),
  hasNext: Schema.Boolean,
  hasPrev: Schema.Boolean,
  nextCursor: Schema.NullOr(Schema.UUID),
});
export type PublicHolidayPage = typeof PublicHolidayPage.Type;
export type PublicHolidayPageEncoded = typeof PublicHolidayPage.Encoded;

/** `listPublicHolidays` query: a date range (both ends included; default the current year) and a page. */
export const PublicHolidayListQuery = pageQueryWith({
  from: Schema.optional(IsoDate),
  to: Schema.optional(IsoDate),
});
export type PublicHolidayListQuery = typeof PublicHolidayListQuery.Type;

/** `createPublicHoliday` body (AC-27). The label is trimmed, then 1 to 100 characters remain. */
export const PublicHolidayCreate = strict(
  Schema.Struct({
    holidayDate: IsoDate,
    name: Schema.Trim.pipe(
      Schema.minLength(1, { message: () => 'Enter a holiday name' }),
      Schema.maxLength(100),
    ),
    /** Confirms the capacity warning (AC-19c, AC-27). */
    confirm: Schema.optionalWith(Schema.Boolean, { exact: true }),
  }),
);
export type PublicHolidayCreate = typeof PublicHolidayCreate.Type;

/** `publicHolidayId` path parameter. */
export const PublicHolidayIdPath = Schema.Struct({ publicHolidayId: Schema.UUID });
