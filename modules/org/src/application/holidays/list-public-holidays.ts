import { Today } from '@arv/kernel';
import { Effect } from 'effect';
import type { CalendarDate } from '../../domain/calendar';
import { requireSignedIn } from '../access';
import { type PageRequest, pageInOrder } from '../page';
import { PublicHolidayRepository } from '../ports';

/** openapi `listPublicHolidays` query: a date range (both ends included) and a page. */
export interface PublicHolidayQuery extends PageRequest {
  /** Defaults to 1 January of the current year. */
  readonly from?: CalendarDate;
  /** Defaults to 31 December of the current year. */
  readonly to?: CalendarDate;
}

/**
 * US-09: a page of the company holiday list in a date range, ordered by date. Any signed-in user
 * may read it (api-sync-report D-5); anonymous → `Unauthenticated`. A range that ends before it
 * starts is empty.
 */
export const listPublicHolidays = (query: PublicHolidayQuery = {}) =>
  Effect.gen(function* () {
    yield* requireSignedIn;
    const today = yield* Today;
    const holidays = yield* PublicHolidayRepository;

    const year = (yield* today.date).slice(0, 4);
    const from = query.from ?? `${year}-01-01`;
    const to = query.to ?? `${year}-12-31`;
    return pageInOrder(yield* holidays.listInRange(from, to), query);
  });
