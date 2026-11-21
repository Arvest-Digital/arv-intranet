import { Database, type DbError, query } from '@arv/db';
import { UserId } from '@arv/kernel';
import { Effect, Layer, Option } from 'effect';
import { ImportRunRepository, type StoredImportRun } from '../application/ports';
import { importRuns } from './schema';

type Row = typeof importRuns.$inferSelect;

const toStored = (row: Row): StoredImportRun => ({
  id: row.id,
  importedBy: UserId.make(row.importedBy),
  employeeRecordsCreated: row.employeeRecordsCreated,
  projectsCreated: row.projectsCreated,
  allocationsCreated: row.allocationsCreated,
  createdAt: row.createdAt,
});

export const DrizzleImportRunRepositoryLive = Layer.effect(
  ImportRunRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    return {
      findCompleted: () =>
        run(query((db) => db.select().from(importRuns).limit(1))).pipe(
          Effect.map((rows) => Option.map(Option.fromNullable(rows[0]), toStored)),
        ),
      // `import_runs_one_time_unique` is the arbiter (AC-32): ON CONFLICT DO NOTHING skips a second
      // run instead of raising, which would make node-postgres drop the socket; the skip is then
      // a defect that rolls back the losing import's unit of work.
      insert: (input) =>
        run(
          query((db) => db.insert(importRuns).values(input).onConflictDoNothing().returning()),
        ).pipe(
          Effect.flatMap(([row]) =>
            row === undefined
              ? Effect.dieMessage('a completed import run already exists (AC-32)')
              : Effect.succeed(toStored(row)),
          ),
        ),
    };
  }),
);
