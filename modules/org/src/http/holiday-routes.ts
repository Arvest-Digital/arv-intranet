import {
  PublicHolidayCreate,
  PublicHolidayIdPath,
  PublicHolidayListQuery,
} from '@arv/contracts/org';
import { type HttpEnv, runEffect, runEffectNoContent, validate } from '@arv/platform/http';
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import { addPublicHoliday, listPublicHolidays, removePublicHoliday } from '../application/holidays';
import { HolidayName, PublicHolidayId } from '../domain/public-holiday';
import { mapOrgErrors } from './map-errors';
import { presentPublicHoliday, presentPublicHolidayPage } from './presenter';

/** The contract already trimmed the name and bounded it, so this never fails. */
const toHolidayName = (name: string) => Schema.decode(HolidayName)(name).pipe(Effect.orDie);

/**
 * The company public-holiday list (openapi.yaml `/org/public-holidays*`, flow 12, US-09).
 * Any signed-in user reads it; adding and removing require `org:manage-holiday-list` (AC-28).
 */
export const holidayRoutes = new Hono<HttpEnv>()
  .get('/org/public-holidays', validate('query', PublicHolidayListQuery), (c) =>
    runEffect(
      c,
      listPublicHolidays(c.req.valid('query')).pipe(
        Effect.map(presentPublicHolidayPage),
        mapOrgErrors,
      ),
    ),
  )
  .post('/org/public-holidays', validate('json', PublicHolidayCreate), (c) => {
    const { holidayDate, name, confirm } = c.req.valid('json');
    return runEffect(
      c,
      toHolidayName(name).pipe(
        Effect.flatMap((holidayName) =>
          addPublicHoliday({
            holidayDate,
            name: holidayName,
            ...(confirm === undefined ? {} : { confirm }),
          }),
        ),
        Effect.map(presentPublicHoliday),
        mapOrgErrors,
      ),
      201,
    );
  })
  .delete('/org/public-holidays/:publicHolidayId', validate('param', PublicHolidayIdPath), (c) =>
    runEffectNoContent(
      c,
      removePublicHoliday(PublicHolidayId.make(c.req.valid('param').publicHolidayId)).pipe(
        mapOrgErrors,
      ),
    ),
  );
