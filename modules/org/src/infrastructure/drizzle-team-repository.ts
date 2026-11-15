import { Database, type DbError, type Executor, query } from '@arv/db';
import { EmployeeId } from '@arv/kernel';
import { and, asc, eq, not, type SQL, sql } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { TeamRepository, type TeamWithMemberCount } from '../application/ports';
import { DuplicateTeamName } from '../domain/errors';
import { type NameKey, nameKey as toNameKey } from '../domain/name';
import { Team, TeamId } from '../domain/team';
import { employeeRecords, teams } from './schema';
import { isUniqueViolation } from './unique-violation';

const NAME_KEY_UNIQUE = 'teams_name_key_unique';
/** Returned from inside a write when the name key is taken by another team. */
const NAME_TAKEN = Symbol('NAME_TAKEN');

/** The name key expression the unique index is built on (AC-19d), so lookups can use the index. */
const nameKey = sql`lower(btrim(${teams.name}))`;

type Row = typeof teams.$inferSelect;

const toTeam = (row: Row) =>
  new Team({
    ...row,
    id: TeamId.make(row.id),
    teamLeadId: row.teamLeadId === null ? null : EmployeeId.make(row.teamLeadId),
  });

/** Teams with their member count: one grouped query over the team_id index. */
const selectWithCounts = (db: Executor, where?: SQL) =>
  db
    .select({
      id: teams.id,
      name: teams.name,
      teamLeadId: teams.teamLeadId,
      createdAt: teams.createdAt,
      memberCount: sql<number>`count(${employeeRecords.id})::int`,
    })
    .from(teams)
    .leftJoin(employeeRecords, eq(employeeRecords.teamId, teams.id))
    .where(where)
    .groupBy(teams.id)
    .orderBy(asc(teams.name), asc(teams.id));

const toWithCount = ({
  memberCount,
  ...row
}: Row & { memberCount: number }): TeamWithMemberCount => ({
  team: toTeam(row),
  memberCount,
});

export const DrizzleTeamRepositoryLive = Layer.effect(
  TeamRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    /**
     * Like `run`, for writes that can hit the name key (AC-19d). A taken key is found before
     * writing; the unique index's violation from a concurrent write also becomes the domain error.
     */
    const runNamed = <A>(
      name: string,
      effect: Effect.Effect<A | typeof NAME_TAKEN, DbError, Database>,
    ) =>
      effect.pipe(
        Effect.provideService(Database, database),
        Effect.catchAll((error) =>
          isUniqueViolation(error, NAME_KEY_UNIQUE)
            ? Effect.succeed(NAME_TAKEN)
            : Effect.die(error),
        ),
        Effect.flatMap((result) =>
          result === NAME_TAKEN
            ? Effect.fail(new DuplicateTeamName({ name }))
            : Effect.succeed(result as A),
        ),
      );

    return {
      list: () =>
        run(query((db) => selectWithCounts(db))).pipe(Effect.map((rows) => rows.map(toWithCount))),
      findById: (id) =>
        run(query((db) => selectWithCounts(db, eq(teams.id, id)))).pipe(
          Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toWithCount))),
        ),
      findByNameKey: (key: NameKey) =>
        run(query((db) => db.select().from(teams).where(sql`${nameKey} = ${key}`).limit(1))).pipe(
          Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toTeam))),
        ),
      // No conflict target: the name key is the only unique index a new row can hit.
      create: (input) =>
        runNamed(
          input.name,
          query(async (db) => {
            const [row] = await db
              .insert(teams)
              .values({ name: input.name, teamLeadId: input.teamLeadId })
              .onConflictDoNothing()
              .returning();
            return row === undefined ? NAME_TAKEN : toTeam(row);
          }),
        ),
      rename: (id, name) =>
        runNamed(
          name,
          query(async (db) => {
            const [clash] = await db
              .select({ id: teams.id })
              .from(teams)
              .where(and(sql`${nameKey} = ${toNameKey(name)}`, not(eq(teams.id, id))))
              .limit(1);
            if (clash !== undefined) return NAME_TAKEN;
            const [row] = await db.update(teams).set({ name }).where(eq(teams.id, id)).returning();
            return Option.fromNullable(row).pipe(Option.map(toTeam));
          }),
        ),
      delete: (id) =>
        run(
          query((db) => db.delete(teams).where(eq(teams.id, id)).returning({ id: teams.id })).pipe(
            Effect.map((rows) => rows.length > 0),
          ),
        ),
    };
  }),
);
