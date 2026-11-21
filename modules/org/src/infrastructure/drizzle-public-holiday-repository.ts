import { Database, type DbError, query } from '@arv/db';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { PublicHolidayRepository } from '../application/ports';
import { DuplicateHolidayDate } from '../domain/errors';
import { PublicHoliday, PublicHolidayId } from '../domain/public-holiday';
import { publicHolidays } from './schema';

type Row = typeof publicHolidays.$inferSelect;

const toPublicHoliday = (row: Row) =>
  new PublicHoliday({ ...row, id: PublicHolidayId.make(row.id) });

export const DrizzlePublicHolidayRepositoryLive = Layer.effect(
  PublicHolidayRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    return {
      // A range scan on the holiday_date unique index (AC-27).
      listInRange: (from, to) =>
        run(
          query((db) =>
            db
              .select()
              .from(publicHolidays)
              .where(
                and(gte(publicHolidays.holidayDate, from), lte(publicHolidays.holidayDate, to)),
              )
              .orderBy(asc(publicHolidays.holidayDate)),
          ),
        ).pipe(Effect.map((rows) => rows.map(toPublicHoliday))),
      findById: (id) =>
        run(
          query((db) => db.select().from(publicHolidays).where(eq(publicHolidays.id, id)).limit(1)),
        ).pipe(
          Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toPublicHoliday))),
        ),
      // The date's unique index is the arbiter: a taken date skips the insert instead of raising.
      create: (input) =>
        run(
          query((db) =>
            db
              .insert(publicHolidays)
              .values({ holidayDate: input.holidayDate, name: input.name })
              .onConflictDoNothing({ target: publicHolidays.holidayDate })
              .returning(),
          ),
        ).pipe(
          Effect.flatMap(([row]) =>
            row === undefined
              ? Effect.fail(new DuplicateHolidayDate({ holidayDate: input.holidayDate }))
              : Effect.succeed(toPublicHoliday(row)),
          ),
        ),
      delete: (id) =>
        run(
          query((db) =>
            db
              .delete(publicHolidays)
              .where(eq(publicHolidays.id, id))
              .returning({ id: publicHolidays.id }),
          ),
        ).pipe(Effect.map((rows) => rows.length > 0)),
    };
  }),
);
