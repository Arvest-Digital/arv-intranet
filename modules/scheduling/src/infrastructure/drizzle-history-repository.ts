import { Database, type DbError, query } from '@arv/db';
import { EmployeeId, ProjectId, UserId } from '@arv/kernel';
import { and, asc, eq, gte, lt, min } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { AllocationHistoryRepository, type StoredHistoryEntry } from '../application/ports';
import { AllocationId, type ChangeKind, HistoryEntry, Segment } from '../domain/allocation';
import { allocationHistory } from './schema';

type Row = typeof allocationHistory.$inferSelect;

/** The before / after snapshots: an opaque JSON list of segments (data-model.md). */
const Snapshot = Schema.NullOr(Schema.Array(Segment));
const encodeSnapshot = Schema.encodeSync(Snapshot);
const decodeSnapshot = Schema.decodeUnknownSync(Snapshot);

/** A row as the domain entry; a row the domain refuses is a defect. */
const toStored = (row: Row): StoredHistoryEntry => ({
  id: row.id,
  allocationId: AllocationId.make(row.allocationId),
  employeeId: EmployeeId.make(row.employeeId),
  projectId: ProjectId.make(row.projectId),
  changedBy: UserId.make(row.changedBy),
  createdAt: row.createdAt,
  entry: new HistoryEntry({
    changeKind: row.changeKind as ChangeKind,
    effectiveFrom: row.effectiveFrom,
    before: decodeSnapshot(row.beforeValues),
    after: decodeSnapshot(row.afterValues),
  }),
});

export const DrizzleAllocationHistoryRepositoryLive = Layer.effect(
  AllocationHistoryRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    return {
      append: ({ allocationId, employeeId, projectId, entry, changedBy }) =>
        run(
          query((db) =>
            db.insert(allocationHistory).values({
              allocationId,
              employeeId,
              projectId,
              changeKind: entry.changeKind,
              effectiveFrom: entry.effectiveFrom,
              beforeValues: encodeSnapshot(entry.before),
              afterValues: encodeSnapshot(entry.after),
              changedBy,
            }),
          ),
        ),
      // `idx_allocation_history_allocation_id_created_at`; ids are UUIDv7, so they break ties in
      // the order the entries were written.
      listForAllocation: (allocationId, since) =>
        run(
          query((db) =>
            db
              .select()
              .from(allocationHistory)
              .where(
                and(
                  eq(allocationHistory.allocationId, allocationId),
                  gte(allocationHistory.createdAt, since),
                ),
              )
              .orderBy(asc(allocationHistory.createdAt), asc(allocationHistory.id)),
          ),
        ).pipe(Effect.map((rows) => rows.map(toStored))),
      deleteBefore: (cutOff) =>
        run(
          query((db) =>
            db
              .delete(allocationHistory)
              .where(lt(allocationHistory.createdAt, cutOff))
              .returning({ id: allocationHistory.id }),
          ),
        ).pipe(Effect.map((rows) => rows.length)),
      // `idx_allocation_history_created_at`: the index's first entry.
      oldestCreatedAt: () =>
        run(
          query((db) =>
            db.select({ oldest: min(allocationHistory.createdAt) }).from(allocationHistory),
          ),
        ).pipe(Effect.map((rows) => rows[0]?.oldest ?? null)),
    };
  }),
);
