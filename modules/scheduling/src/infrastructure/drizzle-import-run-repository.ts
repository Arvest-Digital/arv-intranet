import { Database, type DbError, query } from '@arv/db';
import { Effect, Layer } from 'effect';
import { ImportRunRepository } from '../application/ports';
import { importRuns } from './schema';

export const DrizzleImportRunRepositoryLive = Layer.effect(
  ImportRunRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    return {
      exists: () =>
        run(query((db) => db.select({ id: importRuns.id }).from(importRuns).limit(1))).pipe(
          Effect.map((rows) => rows.length > 0),
        ),
      // `import_runs_one_time_unique` is the arbiter (AC-32): ON CONFLICT DO NOTHING skips a second
      // run instead of raising, which would make node-postgres drop the socket; the skip is then
      // a defect that rolls back the losing import's unit of work.
      insert: (input) =>
        run(
          query((db) =>
            db
              .insert(importRuns)
              .values(input)
              .onConflictDoNothing()
              .returning({ id: importRuns.id }),
          ),
        ).pipe(
          Effect.flatMap((rows) =>
            rows.length === 0
              ? Effect.dieMessage('a completed import run already exists (AC-32)')
              : Effect.void,
          ),
        ),
    };
  }),
);
