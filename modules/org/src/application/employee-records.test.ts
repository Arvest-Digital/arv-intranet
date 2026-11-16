import { Actor, CurrentActor, EmployeeId, Permission, UserId } from '@arv/kernel';
import { Effect, Either, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EmployeeName } from '../domain/employee-record';
import { TeamId } from '../domain/team';
import { MANAGE_EMPLOYEE_RECORDS } from '../permissions';
import {
  changeEmployeeRecord,
  createEmployeeRecord,
  getEmployeeRecord,
  listEmployeeRecords,
} from './employee-records';
import { OrgApi, OrgApiLive } from './org-api';
import { EmployeeRecordRepository } from './ports';
import { makeOrgFakes, type OrgFakes } from './testing';

const name = Schema.decodeSync(EmployeeName);
const EDIT_ALLOCATIONS = Permission.make('scheduling:edit-allocations');
const unknownId = '01a135e4-c4d9-797e-ad76-ae23c85d58cd';

const setup = () => {
  const fakes = makeOrgFakes();
  const manager = fakes.seedLogin();
  const platform = fakes.seedTeam('Platform');
  return { fakes, manager, platform };
};

const managerActor = (id: UserId) =>
  Actor.User({ id, permissions: new Set([MANAGE_EMPLOYEE_RECORDS]) });

const run = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<Exclude<R, CurrentActor>>,
  actor: Actor,
) =>
  Effect.runPromise(
    Effect.either(effect).pipe(
      Effect.provideService(CurrentActor, actor),
      Effect.provide(layer),
    ) as Effect.Effect<Either.Either<A, E>>,
  );

const right = <A, E>(result: Either.Either<A, E>): A => {
  if (Either.isLeft(result))
    throw new Error(`expected success, got ${JSON.stringify(result.left)}`);
  return result.right;
};

const left = <A, E>(result: Either.Either<A, E>): E => {
  if (Either.isRight(result)) throw new Error('expected a failure, got success');
  return result.left;
};

/** A new joiner as in AC-19a: team, 40 hours, Monday–Friday, start next Monday, login linked. */
const joiner = (fakes: OrgFakes, teamId: TeamId | null) => ({
  fullName: name('Test User 1'),
  userId: fakes.seedLogin(),
  teamId,
  contractMinutes: 40 * 60,
  workingDays: [1, 2, 3, 4, 5] as const,
  employmentStart: '2026-11-23',
  employmentEnd: null,
});

type OrgServices = CurrentActor | Layer.Layer.Success<OrgFakes['layer']>;
type Probe = (id: EmployeeId) => Effect.Effect<unknown, { readonly _tag: string }, OrgServices>;

describe('employee records: authorization (AC-22)', () => {
  const probes: ReadonlyArray<readonly [string, Probe]> = [
    ['listEmployeeRecords', () => listEmployeeRecords()],
    ['getEmployeeRecord', (id: EmployeeId) => getEmployeeRecord(id)],
    [
      'createEmployeeRecord',
      () =>
        createEmployeeRecord({
          fullName: name('Mallory'),
          userId: null,
          teamId: null,
          contractMinutes: 2400,
          employmentStart: '2026-11-23',
          employmentEnd: null,
        }),
    ],
    [
      'changeEmployeeRecord',
      (id: EmployeeId) => changeEmployeeRecord(id, { version: 1, contractMinutes: 1200 }),
    ],
  ];

  it.each(probes)('%s refuses a caller without the permission before any read', async (_, make) => {
    const { fakes, manager } = setup();
    const record = fakes.seedRecord({ fullName: 'Test User 2' }, manager);
    const before = fakes.snapshot();
    const reads: string[] = [];
    const spied = Layer.merge(
      fakes.layer,
      Layer.succeed(
        EmployeeRecordRepository,
        new Proxy(fakes.employeeRecords, {
          get: (target, prop) => {
            reads.push(String(prop));
            return Reflect.get(target, prop);
          },
        }),
      ),
    );
    const planner = Actor.User({ id: fakes.seedLogin(), permissions: new Set([EDIT_ALLOCATIONS]) });

    const result = await run(make(record.id), spied, planner);

    expect(left(result)).toMatchObject({
      _tag: 'PermissionDenied',
      permission: MANAGE_EMPLOYEE_RECORDS,
    });
    expect(reads).toEqual([]);
    expect(fakes.snapshot()).toEqual(before);
    expect(fakes.impact.calls).toBe(0);
  });

  it('refuses an anonymous caller', async () => {
    const { fakes } = setup();
    const result = await run(listEmployeeRecords(), fakes.layer, Actor.Anonymous());
    expect(left(result)._tag).toBe('Unauthenticated');
  });
});

describe('createEmployeeRecord', () => {
  it('AC-19a: saves a joiner linked to their login, found by login afterwards', async () => {
    const { fakes, manager, platform } = setup();
    const input = joiner(fakes, platform.id);

    const record = right(
      await run(createEmployeeRecord(input), fakes.layer, managerActor(manager)),
    );

    expect(record).toMatchObject({
      fullName: 'Test User 1',
      userId: input.userId,
      teamId: platform.id,
      contractMinutes: 2400,
      workingDays: [1, 2, 3, 4, 5],
      employmentStart: '2026-11-23',
      employmentEnd: null,
      version: 1,
      lastChangedBy: manager,
    });
    expect(record.isIncomplete).toBe(false);
    // The joiner can open their own schedule: scheduling resolves them by login (flow 8).
    const byLogin = await Effect.runPromise(
      Effect.flatMap(OrgApi, (org) => org.employeeByLogin(input.userId)).pipe(
        Effect.provide(OrgApiLive.pipe(Layer.provide(fakes.layer))),
      ),
    );
    expect(Option.map(byLogin, (r) => r.employeeId)).toEqual(Option.some(record.id));
  });

  it('defaults working days to Monday–Friday and saves an incomplete record (AC-06)', async () => {
    const { fakes, manager } = setup();
    const record = right(
      await run(
        createEmployeeRecord({
          fullName: name('  Test User 3  '),
          userId: null,
          teamId: null,
          contractMinutes: null,
          employmentStart: null,
          employmentEnd: null,
        }),
        fakes.layer,
        managerActor(manager),
      ),
    );
    expect(record.fullName).toBe('Test User 3');
    expect(record.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(record.isIncomplete).toBe(true);
  });

  it('AC-19b: refuses a login already linked, naming the record that holds it', async () => {
    const { fakes, manager, platform } = setup();
    const input = joiner(fakes, platform.id);
    const holder = fakes.seedRecord({ fullName: 'Test User 2', userId: input.userId }, manager);
    const before = fakes.snapshot();

    const result = await run(createEmployeeRecord(input), fakes.layer, managerActor(manager));

    expect(left(result)).toMatchObject({
      _tag: 'LoginAlreadyLinked',
      userId: input.userId,
      employeeId: holder.id,
      fullName: 'Test User 2',
    });
    expect(fakes.snapshot()).toEqual(before);
  });

  it('AC-20: names every broken rule at once and saves nothing', async () => {
    const { fakes, manager } = setup();
    const result = await run(
      createEmployeeRecord({
        fullName: name('Test User 4'),
        userId: null,
        teamId: null,
        contractMinutes: 61 * 60,
        workingDays: [],
        employmentStart: '2026-12-01',
        employmentEnd: '2026-11-30',
      }),
      fakes.layer,
      managerActor(manager),
    );

    const error = left(result);
    expect(error._tag).toBe('InvalidEmployeeRecord');
    expect(error._tag === 'InvalidEmployeeRecord' && error.violations.map((v) => v._tag)).toEqual([
      'ContractHoursOutOfRange',
      'NoWorkingDay',
      'EmploymentEndsBeforeStart',
    ]);
    expect(fakes.snapshot()).toEqual([]);
  });

  it.each([0, -60])('AC-20: refuses %i contract minutes', async (contractMinutes) => {
    const { fakes, manager } = setup();
    const result = await run(
      createEmployeeRecord({ ...joiner(fakes, null), contractMinutes }),
      fakes.layer,
      managerActor(manager),
    );
    expect(left(result)._tag).toBe('InvalidEmployeeRecord');
  });

  it('refuses an unknown team or login', async () => {
    const { fakes, manager, platform } = setup();
    const noTeam = await run(
      createEmployeeRecord({ ...joiner(fakes, platform.id), teamId: TeamId.make(unknownId) }),
      fakes.layer,
      managerActor(manager),
    );
    const noLogin = await run(
      createEmployeeRecord({ ...joiner(fakes, platform.id), userId: UserId.make(unknownId) }),
      fakes.layer,
      managerActor(manager),
    );
    expect(left(noTeam)).toMatchObject({ _tag: 'TeamNotFound', id: unknownId });
    expect(left(noLogin)).toMatchObject({ _tag: 'UserNotFound', id: unknownId });
    expect(fakes.snapshot()).toEqual([]);
  });
});

describe('changeEmployeeRecord', () => {
  const seeded = () => {
    const ctx = setup();
    const record = ctx.fakes.seedRecord(
      { fullName: 'Test User 1', teamId: ctx.platform.id, userId: ctx.fakes.seedLogin() },
      ctx.manager,
    );
    return { ...ctx, record };
  };

  it('AC-19: sets 24 hours on Monday–Wednesday and keeps the fields left out', async () => {
    const { fakes, platform, record } = seeded();
    const editor = fakes.seedLogin();

    const saved = right(
      await run(
        changeEmployeeRecord(record.id, {
          version: 1,
          contractMinutes: 24 * 60,
          workingDays: [3, 1, 2],
        }),
        fakes.layer,
        managerActor(editor),
      ),
    );

    expect(saved).toMatchObject({
      contractMinutes: 1440,
      workingDays: [1, 2, 3],
      fullName: 'Test User 1',
      userId: record.userId,
      teamId: platform.id,
      employmentStart: record.employmentStart,
      version: 2,
      lastChangedBy: editor,
    });
    expect(fakes.impact.calls).toBe(1);
  });

  it('AC-19c: asks for confirmation listing the weeks that would overbook, saving nothing', async () => {
    const { fakes, manager, record } = seeded();
    const weeks = [{ employeeId: record.id, weekStart: '2026-11-23', overMinutes: 480 }];
    fakes.impact.weeks = weeks;
    const before = fakes.snapshot();

    const result = await run(
      changeEmployeeRecord(record.id, { version: 1, contractMinutes: 24 * 60 }),
      fakes.layer,
      managerActor(manager),
    );

    expect(left(result)).toMatchObject({
      _tag: 'CapacityConfirmationRequired',
      overbookedWeeks: weeks,
    });
    expect(fakes.snapshot()).toEqual(before);
  });

  it('AC-19c: saves once confirmed, whatever the impact', async () => {
    const { fakes, manager, record } = seeded();
    fakes.impact.weeks = [{ employeeId: record.id, weekStart: '2026-11-23', overMinutes: 480 }];

    const saved = right(
      await run(
        changeEmployeeRecord(record.id, { version: 1, contractMinutes: 24 * 60, confirm: true }),
        fakes.layer,
        managerActor(manager),
      ),
    );

    expect(saved).toMatchObject({ contractMinutes: 1440, version: 2 });
    expect(fakes.impact.calls).toBe(0);
  });

  it('AC-21: a new end date saves without a capacity check, allocations untouched', async () => {
    const { fakes, manager, record } = seeded();
    fakes.impact.weeks = [{ employeeId: record.id, weekStart: '2026-12-07', overMinutes: 60 }];

    const saved = right(
      await run(
        changeEmployeeRecord(record.id, { version: 1, employmentEnd: '2026-12-15' }),
        fakes.layer,
        managerActor(manager),
      ),
    );

    expect(saved.employmentEnd).toBe('2026-12-15');
    expect(fakes.impact.calls).toBe(0);
  });

  it('does not run the capacity check when hours and days are resent unchanged', async () => {
    const { fakes, manager, record } = seeded();
    right(
      await run(
        changeEmployeeRecord(record.id, {
          version: 1,
          fullName: name('Test User 9'),
          contractMinutes: record.contractMinutes,
          workingDays: [5, 4, 3, 2, 1],
        }),
        fakes.layer,
        managerActor(manager),
      ),
    );
    expect(fakes.impact.calls).toBe(0);
  });

  it('AC-20: checks the rules on the merged record', async () => {
    const { fakes, manager, record } = seeded();
    const before = fakes.snapshot();
    // The stored start is 2026-01-05; only the end is sent.
    const result = await run(
      changeEmployeeRecord(record.id, { version: 1, employmentEnd: '2025-12-31' }),
      fakes.layer,
      managerActor(manager),
    );
    const error = left(result);
    expect(error._tag === 'InvalidEmployeeRecord' && error.violations.map((v) => v._tag)).toEqual([
      'EmploymentEndsBeforeStart',
    ]);
    expect(fakes.snapshot()).toEqual(before);
  });

  it('AC-19b: refuses linking a login held by another record, naming it', async () => {
    const { fakes, manager, record } = seeded();
    const other = fakes.seedRecord({ fullName: 'Test User 2', userId: fakes.seedLogin() }, manager);
    const before = fakes.snapshot();

    const result = await run(
      changeEmployeeRecord(record.id, { version: 1, userId: other.userId }),
      fakes.layer,
      managerActor(manager),
    );

    expect(left(result)).toMatchObject({
      _tag: 'LoginAlreadyLinked',
      employeeId: other.id,
      fullName: 'Test User 2',
    });
    expect(fakes.snapshot()).toEqual(before);
  });

  it('links a new login and unlinks one', async () => {
    const { fakes, manager, record } = seeded();
    const login = fakes.seedLogin();
    const linked = right(
      await run(
        changeEmployeeRecord(record.id, { version: 1, userId: login }),
        fakes.layer,
        managerActor(manager),
      ),
    );
    const unlinked = right(
      await run(
        changeEmployeeRecord(record.id, { version: 2, userId: null }),
        fakes.layer,
        managerActor(manager),
      ),
    );
    expect(linked.userId).toBe(login);
    expect(unlinked).toMatchObject({ userId: null, version: 3 });
  });

  it('refuses an unknown login or team only when newly set', async () => {
    const { fakes, manager, record } = seeded();
    const result = await run(
      changeEmployeeRecord(record.id, { version: 1, userId: UserId.make(unknownId) }),
      fakes.layer,
      managerActor(manager),
    );
    const team = await run(
      changeEmployeeRecord(record.id, { version: 1, teamId: TeamId.make(unknownId) }),
      fakes.layer,
      managerActor(manager),
    );
    expect(left(result)._tag).toBe('UserNotFound');
    expect(left(team)._tag).toBe('TeamNotFound');
  });

  it('a stale version answers a conflict with the current values and who changed them', async () => {
    const { fakes, manager, record } = seeded();
    const other = fakes.seedLogin();
    right(
      await run(
        changeEmployeeRecord(record.id, { version: 1, fullName: name('Test User 5') }),
        fakes.layer,
        managerActor(other),
      ),
    );

    const result = await run(
      changeEmployeeRecord(record.id, { version: 1, contractMinutes: 1200 }),
      fakes.layer,
      managerActor(manager),
    );

    expect(left(result)).toMatchObject({
      _tag: 'EmployeeRecordVersionConflict',
      current: { fullName: 'Test User 5', version: 2, lastChangedBy: other },
    });
    expect(fakes.impact.calls).toBe(0);
  });

  it('a save that loses the race re-reads and answers a conflict', async () => {
    const { fakes, manager, record } = seeded();
    const racer = fakes.seedLogin();
    // Another save lands between this use case's read and its write.
    const racing = Layer.merge(
      fakes.layer,
      Layer.succeed(EmployeeRecordRepository, {
        ...fakes.employeeRecords,
        update: (id, version, input, changedBy) =>
          fakes.employeeRecords
            .update(id, version, { ...input, fullName: name('Racer') }, racer)
            .pipe(Effect.zipRight(fakes.employeeRecords.update(id, version, input, changedBy))),
      }),
    );

    const result = await run(
      changeEmployeeRecord(record.id, { version: 1, fullName: name('Mine') }),
      racing,
      managerActor(manager),
    );

    expect(left(result)).toMatchObject({
      _tag: 'EmployeeRecordVersionConflict',
      current: { fullName: 'Racer', version: 2, lastChangedBy: racer },
    });
  });

  it('an unknown record answers not found', async () => {
    const { fakes, manager } = setup();
    const result = await run(
      changeEmployeeRecord(EmployeeId.make(unknownId), { version: 1 }),
      fakes.layer,
      managerActor(manager),
    );
    expect(left(result)).toMatchObject({ _tag: 'EmployeeRecordNotFound', id: unknownId });
  });
});

describe('reads', () => {
  it('lists a page in id (creation) order and gets one with its version', async () => {
    const { fakes, manager } = setup();
    const b = fakes.seedRecord({ fullName: 'Test User B' }, manager);
    const a = fakes.seedRecord({ fullName: 'Test User A' }, manager);

    const list = right(await run(listEmployeeRecords(), fakes.layer, managerActor(manager)));
    const second = right(
      await run(listEmployeeRecords({ after: b.id, limit: 1 }), fakes.layer, managerActor(manager)),
    );
    const one = right(await run(getEmployeeRecord(b.id), fakes.layer, managerActor(manager)));
    const missing = await run(
      getEmployeeRecord(EmployeeId.make(unknownId)),
      fakes.layer,
      managerActor(manager),
    );

    expect(list.items.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(second).toMatchObject({ hasPrev: true, hasNext: false, nextCursor: null });
    expect(second.items.map((r) => r.id)).toEqual([a.id]);
    expect(one).toMatchObject({ id: b.id, version: 1 });
    expect(left(missing)._tag).toBe('EmployeeRecordNotFound');
  });
});
