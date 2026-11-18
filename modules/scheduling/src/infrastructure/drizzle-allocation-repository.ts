import { Database, type DbError, type Executor, query } from '@arv/db';
import { EmployeeId, ProjectId, UserId } from '@arv/kernel';
import { and, asc, eq, gte, inArray, lte, type SQL, sql } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import {
  type AllocationInWindow,
  AllocationRepository,
  type StoredAllocation,
} from '../application/ports';
import { Allocation, AllocationId, type RatePeriod, Segment } from '../domain/allocation';
import { AllocationNotFound, AllocationVersionConflict } from '../domain/errors';
import { allocationSegments, allocations } from './schema';

type AllocationRow = typeof allocations.$inferSelect;
type SegmentRow = typeof allocationSegments.$inferSelect;

/** A row as the domain segment; a row the domain refuses is a defect (the domain owns the rules). */
const toSegment = (row: Pick<SegmentRow, 'startsOn' | 'endsOn' | 'rateMinutes' | 'ratePeriod'>) =>
  new Segment({
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    rateMinutes: row.rateMinutes,
    ratePeriod: row.ratePeriod as RatePeriod,
  });

const toStored = (row: AllocationRow, segments: ReadonlyArray<SegmentRow>): StoredAllocation => {
  const [first, ...rest] = segments.map(toSegment);
  if (first === undefined) throw new Error(`allocation ${row.id} has no segments`);
  return {
    allocation: new Allocation({
      id: AllocationId.make(row.id),
      employeeId: EmployeeId.make(row.employeeId),
      projectId: ProjectId.make(row.projectId),
      version: row.version,
      segments: [first, ...rest],
    }),
    lastChangedBy: UserId.make(row.lastChangedBy),
    lastChangedAt: row.lastChangedAt,
    createdAt: row.createdAt,
  };
};

/** Identifies a segment by its values, so an unchanged stored segment keeps its row. */
const segmentKey = (s: Pick<SegmentRow, 'startsOn' | 'endsOn' | 'rateMinutes' | 'ratePeriod'>) =>
  `${s.startsOn}|${s.endsOn}|${s.rateMinutes ?? ''}|${s.ratePeriod}`;

const segmentValues = (allocationId: string, segments: ReadonlyArray<Segment>) =>
  segments.map((s) => ({
    allocationId,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    rateMinutes: s.rateMinutes,
    ratePeriod: s.ratePeriod,
  }));

const selectSegments = (db: Executor, allocationId: string) =>
  db
    .select()
    .from(allocationSegments)
    .where(eq(allocationSegments.allocationId, allocationId))
    .orderBy(asc(allocationSegments.startsOn));

/** Returned from inside a guarded write when no row was at the expected version. */
type Missed = { readonly missed: { readonly currentVersion: number | null } };
const isMissed = (value: unknown): value is Missed =>
  typeof value === 'object' && value !== null && 'missed' in value;

/** The stored version, or null when the allocation is gone; read after a guarded write missed. */
const missed = async (db: Executor, id: string): Promise<Missed> => {
  const [row] = await db
    .select({ version: allocations.version })
    .from(allocations)
    .where(eq(allocations.id, id));
  return { missed: { currentVersion: row?.version ?? null } };
};

const byVersion = (id: AllocationId, expectedVersion: number) =>
  and(eq(allocations.id, id), eq(allocations.version, expectedVersion));

export const DrizzleAllocationRepositoryLive = Layer.effect(
  AllocationRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    /** Like `run`, failing `AllocationVersionConflict` / `AllocationNotFound` when the write missed. */
    const runGuarded = <A>(
      id: AllocationId,
      expectedVersion: number,
      effect: Effect.Effect<A | Missed, DbError, Database>,
    ): Effect.Effect<A, AllocationVersionConflict | AllocationNotFound> =>
      run(effect).pipe(
        Effect.flatMap(
          (result): Effect.Effect<A, AllocationVersionConflict | AllocationNotFound> => {
            if (!isMissed(result)) return Effect.succeed(result as A);
            const { currentVersion } = result.missed;
            return currentVersion === null
              ? Effect.fail(new AllocationNotFound({ allocationId: id }))
              : Effect.fail(
                  new AllocationVersionConflict({
                    allocationId: id,
                    expectedVersion,
                    currentVersion,
                  }),
                );
          },
        ),
      );

    const listInWindow: AllocationRepository['Type']['listInWindow'] = (window, filter = {}) => {
      if (filter.employeeIds !== undefined && filter.employeeIds.length === 0)
        return Effect.succeed([]);
      const where = and(
        // The window overlap `idx_allocation_segments_ends_on_starts_on` serves.
        gte(allocationSegments.endsOn, window.from),
        lte(allocationSegments.startsOn, window.to),
        filter.employeeIds === undefined
          ? undefined
          : inArray(allocations.employeeId, [...new Set(filter.employeeIds)]),
        filter.projectId === undefined ? undefined : eq(allocations.projectId, filter.projectId),
      ) as SQL;
      return run(
        query((db) =>
          db
            .select({ allocation: allocations, segment: allocationSegments })
            .from(allocationSegments)
            .innerJoin(allocations, eq(allocations.id, allocationSegments.allocationId))
            .where(where)
            .orderBy(
              asc(allocations.employeeId),
              asc(allocations.projectId),
              asc(allocations.id),
              asc(allocationSegments.startsOn),
            ),
        ),
      ).pipe(
        Effect.map((rows) => {
          const result: Array<AllocationInWindow & { segments: Segment[] }> = [];
          for (const { allocation, segment } of rows) {
            let last = result[result.length - 1];
            if (last === undefined || last.id !== allocation.id) {
              last = {
                id: AllocationId.make(allocation.id),
                employeeId: EmployeeId.make(allocation.employeeId),
                projectId: ProjectId.make(allocation.projectId),
                version: allocation.version,
                lastChangedBy: UserId.make(allocation.lastChangedBy),
                lastChangedAt: allocation.lastChangedAt,
                segments: [],
              };
              result.push(last);
            }
            last.segments.push(toSegment(segment));
          }
          return result;
        }),
      );
    };

    return {
      findById: (id) =>
        run(
          query(async (db) => {
            const [row] = await db.select().from(allocations).where(eq(allocations.id, id));
            if (row === undefined) return Option.none();
            return Option.some(toStored(row, await selectSegments(db, row.id)));
          }),
        ),

      listInWindow,

      // Several statements: the use case wraps them in its `UnitOfWork` with the history entry.
      insert: (input, changedBy) =>
        run(
          query(async (db) => {
            const [row] = await db
              .insert(allocations)
              .values({
                employeeId: input.employeeId,
                projectId: input.projectId,
                version: 1,
                lastChangedBy: changedBy,
              })
              .returning();
            if (row === undefined) throw new Error('allocation INSERT returned no row');
            const segments = await db
              .insert(allocationSegments)
              .values(segmentValues(row.id, input.segments))
              .returning();
            return toStored(
              row,
              [...segments].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
            );
          }),
        ),

      // `UPDATE … WHERE version = $n`: a stale version matches no row (AC-07b). Stored segments
      // that the new list keeps unchanged stay as they are (the past, AC-09b); the rest go.
      update: (id, expectedVersion, segments, changedBy) =>
        runGuarded(
          id,
          expectedVersion,
          query(async (db): Promise<StoredAllocation | Missed> => {
            const [row] = await db
              .update(allocations)
              .set({
                version: sql`${allocations.version} + 1`,
                lastChangedBy: changedBy,
                lastChangedAt: sql`now()`,
              })
              .where(byVersion(id, expectedVersion))
              .returning();
            if (row === undefined) return missed(db, id);

            const wanted = new Map<string, number>();
            for (const s of segments)
              wanted.set(segmentKey(s), (wanted.get(segmentKey(s)) ?? 0) + 1);
            const stale: string[] = [];
            for (const stored of await selectSegments(db, id)) {
              const left = wanted.get(segmentKey(stored)) ?? 0;
              if (left > 0) wanted.set(segmentKey(stored), left - 1);
              else stale.push(stored.id);
            }
            if (stale.length > 0)
              await db.delete(allocationSegments).where(inArray(allocationSegments.id, stale));
            const added = segments.filter((s) => {
              const left = wanted.get(segmentKey(s)) ?? 0;
              if (left === 0) return false;
              wanted.set(segmentKey(s), left - 1);
              return true;
            });
            if (added.length > 0)
              await db.insert(allocationSegments).values(segmentValues(id, added));
            return toStored(row, await selectSegments(db, id));
          }),
        ),

      // Segments go with the allocation (ON DELETE CASCADE); history has no FK and stays (AC-07a).
      delete: (id, expectedVersion) =>
        runGuarded(
          id,
          expectedVersion,
          query(async (db): Promise<undefined | Missed> => {
            const [row] = await db
              .delete(allocations)
              .where(byVersion(id, expectedVersion))
              .returning({ id: allocations.id });
            return row === undefined ? missed(db, id) : undefined;
          }),
        ),
    };
  }),
);
