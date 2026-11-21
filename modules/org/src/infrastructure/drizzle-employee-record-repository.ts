import { Database, type DbError, type Executor, query } from '@arv/db';
import { EmployeeId, UserId } from '@arv/kernel';
import { and, asc, eq, inArray, not, type SQL, sql } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { type EmployeeRecordInput, EmployeeRecordRepository } from '../application/ports';
import type { IsoWeekday } from '../domain/calendar';
import { EmployeeRecord } from '../domain/employee-record';
import { LoginAlreadyLinked } from '../domain/errors';
import { TeamId } from '../domain/team';
import { employeeRecords } from './schema';

type Row = typeof employeeRecords.$inferSelect;

/** A row as the domain entity; a row the entity refuses is a defect (the domain owns the rules). */
const toEmployeeRecord = (row: Row) =>
  new EmployeeRecord({
    ...row,
    id: EmployeeId.make(row.id),
    userId: row.userId === null ? null : UserId.make(row.userId),
    teamId: row.teamId === null ? null : TeamId.make(row.teamId),
    workingDays: row.workingDays as ReadonlyArray<IsoWeekday>,
    lastChangedBy: UserId.make(row.lastChangedBy),
  });

const selectRecords = (db: Executor, where?: SQL) =>
  db
    .select()
    .from(employeeRecords)
    .where(where)
    .orderBy(asc(employeeRecords.fullName), asc(employeeRecords.id));

/** The columns an input writes; the stored working days are a plain array. */
const columns = (input: EmployeeRecordInput) => ({
  fullName: input.fullName,
  userId: input.userId,
  teamId: input.teamId,
  contractMinutes: input.contractMinutes,
  workingDays: [...input.workingDays],
  employmentStart: input.employmentStart,
  employmentEnd: input.employmentEnd,
});

/** The record other than `exceptId` that holds `userId`, if any (AC-19b). */
const findHolder = async (db: Executor, userId: UserId, exceptId?: EmployeeId) => {
  const [holder] = await db
    .select({ id: employeeRecords.id, fullName: employeeRecords.fullName })
    .from(employeeRecords)
    .where(
      and(
        eq(employeeRecords.userId, userId),
        exceptId === undefined ? undefined : not(eq(employeeRecords.id, exceptId)),
      ),
    )
    .limit(1);
  return holder;
};

/** Returned from inside a write when the login is linked to another record. */
type Linked = { readonly linked: { readonly id: string; readonly fullName: string } };
const isLinked = (value: unknown): value is Linked =>
  typeof value === 'object' && value !== null && 'linked' in value;

export const DrizzleEmployeeRecordRepositoryLive = Layer.effect(
  EmployeeRecordRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    /** Like `run`, failing `LoginAlreadyLinked` when the write found the login taken. */
    const runLinking = <A>(
      userId: UserId | null,
      effect: Effect.Effect<A | Linked, DbError, Database>,
    ) =>
      run(effect).pipe(
        Effect.flatMap((result) =>
          isLinked(result) && userId !== null
            ? Effect.fail(
                new LoginAlreadyLinked({
                  userId,
                  employeeId: result.linked.id,
                  fullName: result.linked.fullName,
                }),
              )
            : Effect.succeed(result as A),
        ),
      );

    const findOne = (where: SQL) =>
      run(
        query((db) => selectRecords(db, where).limit(1)).pipe(
          Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toEmployeeRecord))),
        ),
      );

    const listWhere = (where?: SQL) =>
      run(query((db) => selectRecords(db, where))).pipe(
        Effect.map((rows) => rows.map(toEmployeeRecord)),
      );

    return {
      list: () => listWhere(),
      listByIds: (ids) =>
        ids.length === 0
          ? Effect.succeed([])
          : listWhere(inArray(employeeRecords.id, [...new Set(ids)])),
      listByTeam: (teamId) => listWhere(eq(employeeRecords.teamId, teamId)),
      findById: (id) => findOne(eq(employeeRecords.id, id)),
      findByUserId: (userId) => findOne(eq(employeeRecords.userId, userId)),
      // The unique index on user_id is the arbiter: ON CONFLICT DO NOTHING skips the insert
      // instead of raising, which would abort an enclosing UnitOfWork (AC-19b). The record that
      // holds the login is then read in the same transaction, so the error can name it.
      create: (input, changedBy) =>
        runLinking(
          input.userId,
          query(async (db): Promise<EmployeeRecord | Linked> => {
            const [row] = await db
              .insert(employeeRecords)
              .values({ ...columns(input), version: 1, lastChangedBy: changedBy })
              .onConflictDoNothing({ target: employeeRecords.userId })
              .returning();
            if (row !== undefined) return toEmployeeRecord(row);
            const holder = input.userId === null ? undefined : await findHolder(db, input.userId);
            if (holder === undefined) throw new Error('employee record insert skipped, no holder');
            return { linked: holder };
          }),
        ),
      // `UPDATE … WHERE version = $n`: a stale version matches no row (sad §8 Concurrency). A
      // taken login is checked first; the unique index stays the backstop for a concurrent link,
      // which then surfaces as a defect because the aborted transaction can't name the holder.
      update: (id, expectedVersion, input, changedBy) =>
        runLinking(
          input.userId,
          query(async (db): Promise<Option.Option<EmployeeRecord> | Linked> => {
            if (input.userId !== null) {
              const holder = await findHolder(db, input.userId, id);
              if (holder !== undefined) return { linked: holder };
            }
            const [row] = await db
              .update(employeeRecords)
              .set({
                ...columns(input),
                version: sql`${employeeRecords.version} + 1`,
                lastChangedBy: changedBy,
                lastChangedAt: sql`now()`,
              })
              .where(and(eq(employeeRecords.id, id), eq(employeeRecords.version, expectedVersion)))
              .returning();
            return Option.fromNullable(row).pipe(Option.map(toEmployeeRecord));
          }),
        ),
    };
  }),
);
