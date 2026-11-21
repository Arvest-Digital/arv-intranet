import { env } from 'cloudflare:test';
import { DatabaseLive, UnitOfWorkLive } from '@arv/db';
import {
  type AllocationSeed,
  makeAllocation,
  makeHistoryEntry,
  type SegmentSeed,
  seedAllocationHistory,
  seedAllocations,
} from '@arv/db/testing';
import { EmployeeId, ProjectId, UnitOfWork, UserId } from '@arv/kernel';
import { Cause, Effect, Exit, Layer, Option } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
// The adapters are not part of scheduling's public API (wired in its Layer); tests reach them by path.
import {
  AllocationHistoryRepository,
  AllocationRepository,
  ImportRunRepository,
} from '../../../../../modules/scheduling/src/application/ports';
import {
  AllocationId,
  HistoryEntry,
  Segment,
} from '../../../../../modules/scheduling/src/domain/allocation';
import {
  AllocationNotFound,
  AllocationVersionConflict,
} from '../../../../../modules/scheduling/src/domain/errors';
import { DrizzleAllocationRepositoryLive } from '../../../../../modules/scheduling/src/infrastructure/drizzle-allocation-repository';
import { DrizzleAllocationHistoryRepositoryLive } from '../../../../../modules/scheduling/src/infrastructure/drizzle-history-repository';
import { DrizzleImportRunRepositoryLive } from '../../../../../modules/scheduling/src/infrastructure/drizzle-import-run-repository';
import { resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

const TestLayer = Layer.mergeAll(
  DrizzleAllocationRepositoryLive,
  DrizzleAllocationHistoryRepositoryLive,
  DrizzleImportRunRepositoryLive,
  UnitOfWorkLive,
).pipe(Layer.provideMerge(DatabaseLive(env.HYPERDRIVE.connectionString)));

type Services =
  | AllocationRepository
  | AllocationHistoryRepository
  | ImportRunRepository
  | UnitOfWork;

const run = <A, E>(effect: Effect.Effect<A, E, Services>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

const runExit = <A, E>(effect: Effect.Effect<A, E, Services>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(TestLayer)));

const failureOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;

const CHANGER = UserId.make('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91');
const OTHER_CHANGER = UserId.make('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e92');
const EMPLOYEE = EmployeeId.make('0190a0b0-0000-7000-8000-000000000101');
const OTHER_EMPLOYEE = EmployeeId.make('0190a0b0-0000-7000-8000-000000000102');
const PROJECT = ProjectId.make('0190a0b0-0000-7000-8000-000000000201');
const OTHER_PROJECT = ProjectId.make('0190a0b0-0000-7000-8000-000000000202');
const UNKNOWN = AllocationId.make('0190a0b0-0000-7000-8000-00000000ffff');

const seg = (startsOn: string, endsOn: string, rateMinutes: number | null = 240): SegmentSeed => ({
  startsOn,
  endsOn,
  rateMinutes,
  ratePeriod: rateMinutes === null ? 'full-day' : 'day',
});

const seed = async (...rows: Array<Partial<AllocationSeed> & Pick<AllocationSeed, 'segments'>>) => {
  const seeded = await withDb((db) =>
    seedAllocations(
      db,
      rows.map((row) =>
        makeAllocation({
          employeeId: EMPLOYEE,
          projectId: PROJECT,
          lastChangedBy: CHANGER,
          ...row,
        }),
      ),
    ),
  );
  return seeded.map((row) => AllocationId.make(row.id));
};

/** Stored segment rows of an allocation, read on a separate connection. */
const storedSegments = (allocationId: string) =>
  withDb(async (db) => {
    const { rows } = await db.execute<{ id: string; startsOn: string; endsOn: string }>(
      `SELECT id, starts_on::text AS "startsOn", ends_on::text AS "endsOn"
       FROM scheduling.allocation_segments WHERE allocation_id = '${allocationId}'
       ORDER BY starts_on`,
    );
    return rows;
  });

const countRows = (table: string, where = 'true') =>
  withDb(async (db) => {
    const { rows } = await db.execute<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling.${table} WHERE ${where}`,
    );
    return rows[0]!.n;
  });

describe('DrizzleAllocationRepository: write and read the aggregate', () => {
  it('inserts an allocation at version 1 with its segments, stamped by the changer (AC-07)', async () => {
    const stored = await run(
      Effect.flatMap(AllocationRepository, (repo) =>
        repo.insert(
          {
            employeeId: EMPLOYEE,
            projectId: PROJECT,
            segments: [new Segment(seg('2026-11-16', '2026-12-31'))],
          },
          CHANGER,
        ),
      ),
    );
    expect(stored.allocation).toMatchObject({
      employeeId: EMPLOYEE,
      projectId: PROJECT,
      version: 1,
      segments: [{ startsOn: '2026-11-16', endsOn: '2026-12-31', rateMinutes: 240 }],
    });
    expect(stored.lastChangedBy).toBe(CHANGER);
    expect(stored.lastChangedAt).toBeInstanceOf(Date);

    const found = await run(
      Effect.flatMap(AllocationRepository, (repo) => repo.findById(stored.allocation.id)),
    );
    expect(Option.getOrThrow(found)).toEqual(stored);
  });

  it('insertMany: 2,500 allocations in batches, ids in input order, each with its segments (flow 13)', async () => {
    const inputs = Array.from({ length: 2500 }, (_, i) => ({
      employeeId: i % 2 === 0 ? EMPLOYEE : OTHER_EMPLOYEE,
      projectId: i % 3 === 0 ? PROJECT : OTHER_PROJECT,
      segments: [new Segment(seg('2026-11-16', '2026-12-31', 15 * (1 + (i % 32))))] as const,
    }));
    const ids = await run(
      Effect.flatMap(AllocationRepository, (repo) => repo.insertMany(inputs, CHANGER)),
    );

    expect(ids).toHaveLength(2500);
    expect(new Set(ids).size).toBe(2500);
    expect(await countRows('allocations')).toBe(2500);
    expect(await countRows('allocation_segments')).toBe(2500);
    for (const i of [0, 1, 999, 1000, 2499]) {
      const found = Option.getOrThrow(
        await run(Effect.flatMap(AllocationRepository, (repo) => repo.findById(ids[i]!))),
      );
      expect(found.allocation).toMatchObject({
        employeeId: inputs[i]!.employeeId,
        projectId: inputs[i]!.projectId,
        version: 1,
        segments: [{ rateMinutes: 15 * (1 + (i % 32)) }],
      });
      expect(found.lastChangedBy).toBe(CHANGER);
    }
    expect(
      await run(Effect.flatMap(AllocationRepository, (repo) => repo.insertMany([], CHANGER))),
    ).toEqual([]);
  });

  it('finds nothing for an unknown id', async () => {
    const found = await run(Effect.flatMap(AllocationRepository, (repo) => repo.findById(UNKNOWN)));
    expect(Option.isNone(found)).toBe(true);
  });

  it('updates at the expected version: bumps it, keeps unchanged past segments and replaces the rest', async () => {
    const [id] = await seed({
      version: 2,
      segments: [seg('2026-11-02', '2026-11-08', 120), seg('2026-11-09', '2026-12-31')],
    });
    const [past] = await storedSegments(id!);

    const updated = await run(
      Effect.flatMap(AllocationRepository, (repo) =>
        repo.update(
          id!,
          2,
          [
            new Segment(seg('2026-11-02', '2026-11-08', 120)),
            new Segment(seg('2026-11-09', '2026-11-16')),
            new Segment(seg('2026-11-17', '2027-01-31', 480)),
          ],
          OTHER_CHANGER,
        ),
      ),
    );
    expect(updated.allocation.version).toBe(3);
    expect(updated.lastChangedBy).toBe(OTHER_CHANGER);
    expect(updated.allocation.segments.map((s) => [s.startsOn, s.endsOn, s.rateMinutes])).toEqual([
      ['2026-11-02', '2026-11-08', 120],
      ['2026-11-09', '2026-11-16', 240],
      ['2026-11-17', '2027-01-31', 480],
    ]);
    const rows = await storedSegments(id!);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.id).toBe(past!.id);
  });

  it('refuses a stale version: 0 rows, a version conflict naming the stored version, nothing changed (AC-07b)', async () => {
    const [id] = await seed({ version: 3, segments: [seg('2026-11-09', '2026-12-31')] });
    const before = await storedSegments(id!);

    const exit = await runExit(
      Effect.flatMap(AllocationRepository, (repo) =>
        repo.update(id!, 2, [new Segment(seg('2026-11-09', '2027-03-31'))], OTHER_CHANGER),
      ),
    );
    expect(failureOf(exit)).toEqual(
      new AllocationVersionConflict({ allocationId: id!, expectedVersion: 2, currentVersion: 3 }),
    );

    const after = Option.getOrThrow(
      await run(Effect.flatMap(AllocationRepository, (repo) => repo.findById(id!))),
    );
    expect(after.allocation.version).toBe(3);
    expect(after.lastChangedBy).toBe(CHANGER);
    expect(await storedSegments(id!)).toEqual(before);
  });

  it('refuses to update or delete an allocation that is gone', async () => {
    const update = await runExit(
      Effect.flatMap(AllocationRepository, (repo) =>
        repo.update(UNKNOWN, 1, [new Segment(seg('2026-11-09', '2026-12-31'))], CHANGER),
      ),
    );
    expect(failureOf(update)).toEqual(new AllocationNotFound({ allocationId: UNKNOWN }));

    const remove = await runExit(
      Effect.flatMap(AllocationRepository, (repo) => repo.delete(UNKNOWN, 1)),
    );
    expect(failureOf(remove)).toEqual(new AllocationNotFound({ allocationId: UNKNOWN }));
  });

  it('deletes the allocation and its segments but keeps its history rows (AC-07a)', async () => {
    const [id] = await seed({ segments: [seg('2026-11-23', '2026-12-31')] });
    await withDb((db) =>
      seedAllocationHistory(db, [
        makeHistoryEntry({
          allocationId: id!,
          employeeId: EMPLOYEE,
          projectId: PROJECT,
          changedBy: CHANGER,
        }),
      ]),
    );

    await run(
      Effect.gen(function* () {
        const allocations = yield* AllocationRepository;
        const history = yield* AllocationHistoryRepository;
        yield* allocations.delete(id!, 1);
        yield* history.append({
          allocationId: id!,
          employeeId: EMPLOYEE,
          projectId: PROJECT,
          changedBy: OTHER_CHANGER,
          entry: new HistoryEntry({
            changeKind: 'removed',
            effectiveFrom: '2026-11-17',
            before: [new Segment(seg('2026-11-23', '2026-12-31'))],
            after: null,
          }),
        });
      }),
    );

    expect(await countRows('allocations')).toBe(0);
    expect(await countRows('allocation_segments')).toBe(0);
    expect(await countRows('allocation_history', `allocation_id = '${id}'`)).toBe(2);
  });

  it('refuses a delete at a stale version and keeps the allocation (AC-07b)', async () => {
    const [id] = await seed({ version: 2, segments: [seg('2026-11-23', '2026-12-31')] });
    const exit = await runExit(Effect.flatMap(AllocationRepository, (repo) => repo.delete(id!, 1)));
    expect(failureOf(exit)).toBeInstanceOf(AllocationVersionConflict);
    expect(await countRows('allocations')).toBe(1);
  });

  it('rolls the allocation back with the rest of the unit of work (ADR-0006)', async () => {
    const exit = await runExit(
      Effect.gen(function* () {
        const uow = yield* UnitOfWork;
        const allocations = yield* AllocationRepository;
        yield* uow.transactional(
          Effect.gen(function* () {
            yield* allocations.insert(
              {
                employeeId: EMPLOYEE,
                projectId: PROJECT,
                segments: [new Segment(seg('2026-11-16', '2026-12-31'))],
              },
              CHANGER,
            );
            return yield* Effect.fail('boom' as const);
          }),
        );
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(await countRows('allocations')).toBe(0);
    expect(await countRows('allocation_segments')).toBe(0);
  });
});

describe('DrizzleAllocationRepository: window reads', () => {
  const window = { from: '2026-11-16', to: '2026-11-29' };

  it('returns only the segments that overlap the window, edges included', async () => {
    const [split, outside, leave] = await seed(
      {
        segments: [
          seg('2026-10-01', '2026-11-15', 120), // ends the day before the window
          seg('2026-11-16', '2026-11-20', 240), // starts on the first day
          seg('2026-11-21', '2026-12-31', 480), // runs past the last day
        ],
      },
      { projectId: OTHER_PROJECT, segments: [seg('2026-11-30', '2026-12-31')] },
      { employeeId: OTHER_EMPLOYEE, segments: [seg('2026-11-29', '2026-11-29', null)] },
    );

    const found = await run(
      Effect.flatMap(AllocationRepository, (repo) => repo.listInWindow(window)),
    );
    const byId = new Map(found.map((a) => [a.id, a]));
    expect(byId.has(outside!)).toBe(false);
    expect(byId.get(split!)?.segments.map((s) => [s.startsOn, s.endsOn])).toEqual([
      ['2026-11-16', '2026-11-20'],
      ['2026-11-21', '2026-12-31'],
    ]);
    expect(byId.get(split!)).toMatchObject({
      employeeId: EMPLOYEE,
      projectId: PROJECT,
      version: 1,
      lastChangedBy: CHANGER,
    });
    expect(byId.get(leave!)?.segments).toEqual([
      new Segment({
        startsOn: '2026-11-29',
        endsOn: '2026-11-29',
        rateMinutes: null,
        ratePeriod: 'full-day',
      }),
    ]);
  });

  it('narrows to resources and to a project', async () => {
    const [mine, otherProject, someoneElse] = await seed(
      { segments: [seg('2026-11-16', '2026-12-31')] },
      { projectId: OTHER_PROJECT, segments: [seg('2026-11-16', '2026-12-31')] },
      { employeeId: OTHER_EMPLOYEE, segments: [seg('2026-11-16', '2026-12-31')] },
    );
    const ids = (filter: Parameters<AllocationRepository['Type']['listInWindow']>[1]) =>
      run(Effect.flatMap(AllocationRepository, (repo) => repo.listInWindow(window, filter))).then(
        (rows) => rows.map((a) => a.id).sort(),
      );

    expect(await ids({ employeeIds: [EMPLOYEE] })).toEqual([mine, otherProject].sort());
    expect(await ids({ projectId: PROJECT })).toEqual([mine, someoneElse].sort());
    expect(await ids({ employeeIds: [EMPLOYEE], projectId: OTHER_PROJECT })).toEqual([
      otherProject,
    ]);
    expect(await ids({ employeeIds: [] })).toEqual([]);
  });
});

describe('DrizzleAllocationHistoryRepository (AC-16)', () => {
  const ALLOCATION = AllocationId.make('0190a0b0-0000-7000-8000-000000000301');

  it('appends entries and lists them oldest first with their before / after segments', async () => {
    const before = [new Segment(seg('2026-11-09', '2026-12-31'))];
    const after = [
      new Segment(seg('2026-11-09', '2026-11-16')),
      new Segment({
        startsOn: '2026-11-17',
        endsOn: '2026-12-31',
        rateMinutes: 1200,
        ratePeriod: 'week',
      }),
    ];
    const ids = { allocationId: ALLOCATION, employeeId: EMPLOYEE, projectId: PROJECT };

    await run(
      Effect.gen(function* () {
        const history = yield* AllocationHistoryRepository;
        yield* history.append({
          ...ids,
          changedBy: CHANGER,
          entry: new HistoryEntry({
            changeKind: 'created',
            effectiveFrom: null,
            before: null,
            after: before,
          }),
        });
        yield* history.append({
          ...ids,
          changedBy: OTHER_CHANGER,
          entry: new HistoryEntry({
            changeKind: 'changed',
            effectiveFrom: '2026-11-17',
            before,
            after,
          }),
        });
      }),
    );

    const listed = await run(
      Effect.flatMap(AllocationHistoryRepository, (repo) =>
        repo.listForAllocation(ALLOCATION, new Date('2025-11-17T00:00:00Z')),
      ),
    );
    expect(listed.map((e) => [e.entry.changeKind, e.changedBy])).toEqual([
      ['created', CHANGER],
      ['changed', OTHER_CHANGER],
    ]);
    expect(listed[1]).toMatchObject({ ...ids, entry: { effectiveFrom: '2026-11-17' } });
    expect(listed[1]!.entry.before).toEqual(before);
    expect(listed[1]!.entry.after).toEqual(after);
    expect(listed[0]!.entry.before).toBeNull();
  });

  it('lists only the entries since the given time, ignoring other allocations', async () => {
    const base = { employeeId: EMPLOYEE, projectId: PROJECT, changedBy: CHANGER };
    await withDb((db) =>
      seedAllocationHistory(db, [
        makeHistoryEntry({
          ...base,
          allocationId: ALLOCATION,
          createdAt: new Date('2025-10-01T00:00:00Z'),
        }),
        makeHistoryEntry({
          ...base,
          allocationId: ALLOCATION,
          changeKind: 'trimmed',
          effectiveFrom: '2026-12-01',
          createdAt: new Date('2026-06-01T00:00:00Z'),
        }),
        makeHistoryEntry({ ...base, allocationId: UNKNOWN }),
      ]),
    );

    const listed = await run(
      Effect.flatMap(AllocationHistoryRepository, (repo) =>
        repo.listForAllocation(ALLOCATION, new Date('2025-11-17T00:00:00Z')),
      ),
    );
    expect(listed.map((e) => e.entry.changeKind)).toEqual(['trimmed']);
  });

  it('deletes only the entries recorded before the cut-off, and is idempotent', async () => {
    const base = {
      allocationId: ALLOCATION,
      employeeId: EMPLOYEE,
      projectId: PROJECT,
      changedBy: CHANGER,
    };
    await withDb((db) =>
      seedAllocationHistory(db, [
        makeHistoryEntry({ ...base, createdAt: new Date('2025-10-31T23:59:59Z') }),
        makeHistoryEntry({ ...base, createdAt: new Date('2025-09-01T00:00:00Z') }),
        makeHistoryEntry({ ...base, createdAt: new Date('2025-11-01T00:00:00Z') }),
      ]),
    );
    const cutOff = new Date('2025-11-01T00:00:00Z');
    const purge = () =>
      run(Effect.flatMap(AllocationHistoryRepository, (repo) => repo.deleteBefore(cutOff)));

    expect(await purge()).toBe(2);
    expect(await purge()).toBe(0);
    expect(await countRows('allocation_history')).toBe(1);
  });
});

describe('DrizzleAllocationHistoryRepository.appendMany (flow 13)', () => {
  it('appends every entry in batches', async () => {
    const [id] = await seed({ segments: [seg('2026-11-16', '2026-12-31')] });
    const entries = Array.from({ length: 1500 }, () => ({
      allocationId: id!,
      employeeId: EMPLOYEE,
      projectId: PROJECT,
      changedBy: CHANGER,
      entry: new HistoryEntry({
        changeKind: 'imported',
        effectiveFrom: null,
        before: null,
        after: [new Segment(seg('2026-11-16', '2026-12-31'))],
      }),
    }));
    await run(Effect.flatMap(AllocationHistoryRepository, (repo) => repo.appendMany(entries)));

    expect(await countRows('allocation_history', "change_kind = 'imported'")).toBe(1500);
    const listed = await run(
      Effect.flatMap(AllocationHistoryRepository, (repo) =>
        repo.listForAllocation(id!, new Date(0)),
      ),
    );
    expect(listed[0]?.entry).toEqual(entries[0]!.entry);
  });
});

describe('DrizzleImportRunRepository (AC-32)', () => {
  const report = {
    importedBy: CHANGER,
    employeeRecordsCreated: 3,
    projectsCreated: 2,
    allocationsCreated: 5,
  };

  it('records one completed run and finds it', async () => {
    const repo = <A>(f: (r: ImportRunRepository['Type']) => Effect.Effect<A>) =>
      run(Effect.flatMap(ImportRunRepository, f));
    expect(await repo((r) => r.findCompleted())).toEqual(Option.none());
    const stored = await repo((r) => r.insert(report));
    expect(stored).toMatchObject(report);
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect(await repo((r) => r.findCompleted())).toEqual(Option.some(stored));
  });

  it('refuses a second run as a defect (the one-time unique index)', async () => {
    await run(Effect.flatMap(ImportRunRepository, (r) => r.insert(report)));
    const exit = await runExit(Effect.flatMap(ImportRunRepository, (r) => r.insert(report)));
    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
    expect(await countRows('import_runs')).toBe(1);
  });
});
