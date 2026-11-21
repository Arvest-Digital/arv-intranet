import { env } from 'cloudflare:test';
import { DatabaseLive, UnitOfWorkLive } from '@arv/db';
import {
  makeEmployeeRecord,
  makePublicHoliday,
  makeTeam,
  makeUser,
  seedEmployeeRecords,
  seedPublicHolidays,
  seedTeams,
  seedUsers,
} from '@arv/db/testing';
import { EmployeeId, UnitOfWork, UserId } from '@arv/kernel';
import { Effect, Exit, Layer, Option, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
// The adapters are not part of org's public API (wired in its Layer); tests reach them by path.
import {
  type EmployeeRecordInput,
  EmployeeRecordRepository,
  PublicHolidayRepository,
  TeamRepository,
} from '../../../../../modules/org/src/application/ports';
import { EmployeeName } from '../../../../../modules/org/src/domain/employee-record';
import {
  DuplicateHolidayDate,
  DuplicateTeamName,
  LoginAlreadyLinked,
} from '../../../../../modules/org/src/domain/errors';
import { nameKey } from '../../../../../modules/org/src/domain/name';
import { HolidayName } from '../../../../../modules/org/src/domain/public-holiday';
import { TeamId, TeamName } from '../../../../../modules/org/src/domain/team';
import { DrizzleEmployeeRecordRepositoryLive } from '../../../../../modules/org/src/infrastructure/drizzle-employee-record-repository';
import { DrizzlePublicHolidayRepositoryLive } from '../../../../../modules/org/src/infrastructure/drizzle-public-holiday-repository';
import { DrizzleTeamRepositoryLive } from '../../../../../modules/org/src/infrastructure/drizzle-team-repository';
import { resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

const TestLayer = Layer.mergeAll(
  DrizzleEmployeeRecordRepositoryLive,
  DrizzleTeamRepositoryLive,
  DrizzlePublicHolidayRepositoryLive,
  UnitOfWorkLive,
).pipe(Layer.provideMerge(DatabaseLive(env.HYPERDRIVE.connectionString)));

type Services = EmployeeRecordRepository | TeamRepository | PublicHolidayRepository | UnitOfWork;

const run = <A, E>(effect: Effect.Effect<A, E, Services>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

const runExit = <A, E>(effect: Effect.Effect<A, E, Services>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(TestLayer)));

const records = EmployeeRecordRepository;
const teamsRepo = TeamRepository;
const holidays = PublicHolidayRepository;

const CHANGER = UserId.make('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91');
const OTHER_CHANGER = UserId.make('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e92');

const input = (overrides: Partial<EmployeeRecordInput> = {}): EmployeeRecordInput => ({
  fullName: Schema.decodeSync(EmployeeName)('Test User A'),
  userId: null,
  teamId: null,
  contractMinutes: 2400,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2026-11-02',
  employmentEnd: null,
  ...overrides,
});

/** One stored employee record row, read on a separate connection. */
const storedRecord = (id: string) =>
  withDb(async (db) => {
    const { rows } = await db.execute<{
      contractMinutes: number | null;
      version: number;
      lastChangedBy: string;
    }>(
      `SELECT contract_minutes AS "contractMinutes", version, last_changed_by AS "lastChangedBy"
       FROM org.employee_records WHERE id = '${id}'`,
    );
    return rows[0];
  });

describe('DrizzleEmployeeRecordRepository', () => {
  it('creates a record at version 1 linked to a login, found by that login (AC-19a)', async () => {
    const user = await withDb(async (db) => (await seedUsers(db, [makeUser()]))[0]!);
    const userId = UserId.make(user.id);

    const created = await run(
      Effect.flatMap(records, (repo) => repo.create(input({ userId }), CHANGER)),
    );
    expect(created).toMatchObject({
      fullName: 'Test User A',
      userId,
      contractMinutes: 2400,
      workingDays: [1, 2, 3, 4, 5],
      employmentStart: '2026-11-02',
      employmentEnd: null,
      version: 1,
      lastChangedBy: CHANGER,
    });

    const found = await run(Effect.flatMap(records, (repo) => repo.findByUserId(userId)));
    expect(Option.getOrThrow(found).id).toBe(created.id);
  });

  it('updates at the expected version, bumping it and stamping who changed it', async () => {
    const [seeded] = await withDb((db) =>
      seedEmployeeRecords(db, [makeEmployeeRecord({ lastChangedBy: CHANGER, version: 3 })]),
    );
    const id = EmployeeId.make(seeded!.id);

    const updated = await run(
      Effect.flatMap(records, (repo) =>
        repo.update(id, 3, input({ contractMinutes: 1440, workingDays: [1, 2, 3] }), OTHER_CHANGER),
      ),
    );
    expect(Option.getOrThrow(updated)).toMatchObject({
      id,
      contractMinutes: 1440,
      workingDays: [1, 2, 3],
      version: 4,
      lastChangedBy: OTHER_CHANGER,
    });
  });

  it('updates 0 rows on a version mismatch and leaves the record as it was (sad §8)', async () => {
    const [seeded] = await withDb((db) =>
      seedEmployeeRecords(db, [makeEmployeeRecord({ lastChangedBy: CHANGER, version: 2 })]),
    );
    const id = EmployeeId.make(seeded!.id);

    const stale = await run(
      Effect.flatMap(records, (repo) =>
        repo.update(id, 1, input({ contractMinutes: 1440 }), OTHER_CHANGER),
      ),
    );
    expect(Option.isNone(stale)).toBe(true);
    expect(await storedRecord(id)).toEqual({
      contractMinutes: 2400,
      version: 2,
      lastChangedBy: CHANGER,
    });
  });

  it('two saves from the same version: the first wins, the second matches no row', async () => {
    const [seeded] = await withDb((db) =>
      seedEmployeeRecords(db, [makeEmployeeRecord({ lastChangedBy: CHANGER })]),
    );
    const id = EmployeeId.make(seeded!.id);
    const save = (minutes: number, by: UserId) =>
      run(
        Effect.flatMap(records, (repo) =>
          repo.update(id, 1, input({ contractMinutes: minutes }), by),
        ),
      );

    expect(Option.isSome(await save(1440, CHANGER))).toBe(true);
    expect(Option.isNone(await save(1800, OTHER_CHANGER))).toBe(true);
    expect(await storedRecord(id)).toMatchObject({ contractMinutes: 1440, version: 2 });
  });

  it('refuses to create a second record for a linked login, naming the holder (AC-19b)', async () => {
    const { user, holder } = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [holder] = await seedEmployeeRecords(db, [
        makeEmployeeRecord({ userId: user!.id, lastChangedBy: CHANGER }),
      ]);
      return { user: user!, holder: holder! };
    });

    const exit = await runExit(
      Effect.flatMap(records, (repo) =>
        repo.create(input({ userId: UserId.make(user.id) }), CHANGER),
      ),
    );
    expect(exit).toEqual(
      Exit.fail(
        new LoginAlreadyLinked({
          userId: user.id,
          employeeId: holder.id,
          fullName: holder.fullName,
        }),
      ),
    );
    const all = await run(Effect.flatMap(records, (repo) => repo.list()));
    expect(all.map((r) => r.id)).toEqual([holder.id]);
  });

  it('refuses to link a login held by another record on update, inside a unit of work (AC-19b)', async () => {
    const { user, holder, other } = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [holder, other] = await seedEmployeeRecords(db, [
        makeEmployeeRecord({ userId: user!.id, lastChangedBy: CHANGER }),
        makeEmployeeRecord({ lastChangedBy: CHANGER }),
      ]);
      return { user: user!, holder: holder!, other: other! };
    });

    const exit = await runExit(
      Effect.flatMap(UnitOfWork, (uow) =>
        uow.transactional(
          Effect.flatMap(records, (repo) =>
            repo.update(
              EmployeeId.make(other.id),
              1,
              input({ userId: UserId.make(user.id) }),
              CHANGER,
            ),
          ),
        ),
      ),
    );
    expect(exit).toEqual(
      Exit.fail(
        new LoginAlreadyLinked({
          userId: user.id,
          employeeId: holder.id,
          fullName: holder.fullName,
        }),
      ),
    );
    expect(await storedRecord(other.id)).toMatchObject({ version: 1 });
  });

  it('keeps its own login on update', async () => {
    const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
    const [seeded] = await withDb((db) =>
      seedEmployeeRecords(db, [makeEmployeeRecord({ userId: user!.id, lastChangedBy: CHANGER })]),
    );
    const updated = await run(
      Effect.flatMap(records, (repo) =>
        repo.update(
          EmployeeId.make(seeded!.id),
          1,
          input({ userId: UserId.make(user!.id) }),
          CHANGER,
        ),
      ),
    );
    expect(Option.getOrThrow(updated).userId).toBe(user!.id);
  });

  it('reads incomplete records and lists by team and by ids (AC-06)', async () => {
    const { team, inTeam, incomplete } = await withDb(async (db) => {
      const [team] = await seedTeams(db, [makeTeam()]);
      const [inTeam, incomplete] = await seedEmployeeRecords(db, [
        makeEmployeeRecord({ fullName: 'Test User B', teamId: team!.id, lastChangedBy: CHANGER }),
        makeEmployeeRecord({
          fullName: 'Test User A',
          contractMinutes: null,
          employmentStart: null,
          lastChangedBy: CHANGER,
        }),
      ]);
      return { team: team!, inTeam: inTeam!, incomplete: incomplete! };
    });

    const { all, byTeam, byIds } = await run(
      Effect.flatMap(records, (repo) =>
        Effect.all({
          all: repo.list(),
          byTeam: repo.listByTeam(TeamId.make(team.id)),
          byIds: repo.listByIds([EmployeeId.make(incomplete.id)]),
        }),
      ),
    );
    expect(all.map((r) => r.fullName)).toEqual(['Test User A', 'Test User B']);
    expect(all[0]!.isIncomplete).toBe(true);
    expect(byTeam.map((r) => r.id)).toEqual([inTeam.id]);
    expect(byIds.map((r) => r.id)).toEqual([incomplete.id]);
  });
});

describe('DrizzleTeamRepository', () => {
  const teamName = Schema.decodeSync(TeamName);

  it('lists teams with their member count', async () => {
    const { platform, data } = await withDb(async (db) => {
      const [platform, data] = await seedTeams(db, [
        makeTeam({ name: 'Platform' }),
        makeTeam({ name: 'Data' }),
      ]);
      await seedEmployeeRecords(db, [
        makeEmployeeRecord({ teamId: platform!.id, lastChangedBy: CHANGER }),
        makeEmployeeRecord({ teamId: platform!.id, lastChangedBy: CHANGER }),
        makeEmployeeRecord({ lastChangedBy: CHANGER }),
      ]);
      return { platform: platform!, data: data! };
    });

    const list = await run(Effect.flatMap(teamsRepo, (repo) => repo.list()));
    expect(list.map(({ team, memberCount }) => [team.id, memberCount])).toEqual([
      [data.id, 0],
      [platform.id, 2],
    ]);
    const found = await run(
      Effect.flatMap(teamsRepo, (repo) => repo.findById(TeamId.make(platform.id))),
    );
    expect(Option.getOrThrow(found).memberCount).toBe(2);
  });

  it('refuses «platform » next to «Platform» on create and update (AC-19d)', async () => {
    const created = await run(
      Effect.flatMap(teamsRepo, (repo) =>
        repo.create({ name: teamName('Platform'), teamLeadId: null }),
      ),
    );
    expect(created.name).toBe('Platform');

    const duplicate = await runExit(
      Effect.flatMap(teamsRepo, (repo) =>
        repo.create({ name: 'platform ' as TeamName, teamLeadId: null }),
      ),
    );
    expect(duplicate).toEqual(Exit.fail(new DuplicateTeamName({ name: 'platform ' })));

    const other = await run(
      Effect.flatMap(teamsRepo, (repo) =>
        repo.create({ name: teamName('Data'), teamLeadId: null }),
      ),
    );
    const clash = await runExit(
      Effect.flatMap(teamsRepo, (repo) =>
        repo.update(other.id, { name: teamName('PLATFORM'), teamLeadId: null }),
      ),
    );
    expect(clash).toEqual(Exit.fail(new DuplicateTeamName({ name: 'PLATFORM' })));

    // Renaming a team to another spelling of its own name is fine.
    const renamed = await run(
      Effect.flatMap(teamsRepo, (repo) =>
        repo.update(created.id, { name: teamName('PLATFORM'), teamLeadId: null }),
      ),
    );
    expect(Option.getOrThrow(renamed).name).toBe('PLATFORM');
    const byKey = await run(
      Effect.flatMap(teamsRepo, (repo) => repo.findByNameKey(nameKey(' platform'))),
    );
    expect(Option.getOrThrow(byKey).id).toBe(created.id);
  });

  it('update replaces the team lead with the name', async () => {
    const [lead] = await withDb((db) =>
      seedEmployeeRecords(db, [makeEmployeeRecord({ lastChangedBy: CHANGER })]),
    );
    const created = await run(
      Effect.flatMap(teamsRepo, (repo) =>
        repo.create({ name: teamName('Platform'), teamLeadId: null }),
      ),
    );
    const updated = await run(
      Effect.flatMap(teamsRepo, (repo) =>
        repo.update(created.id, {
          name: teamName('Platform'),
          teamLeadId: EmployeeId.make(lead!.id),
        }),
      ),
    );
    expect(Option.getOrThrow(updated).teamLeadId).toBe(lead!.id);
    const gone = await run(
      Effect.flatMap(teamsRepo, (repo) =>
        repo.update(TeamId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd'), {
          name: teamName('Elsewhere'),
          teamLeadId: null,
        }),
      ),
    );
    expect(gone).toEqual(Option.none());
  });

  it('deletes a team, and reports a missing one', async () => {
    const [team] = await withDb((db) => seedTeams(db, [makeTeam()]));
    const id = TeamId.make(team!.id);
    expect(await run(Effect.flatMap(teamsRepo, (repo) => repo.delete(id)))).toBe(true);
    expect(await run(Effect.flatMap(teamsRepo, (repo) => repo.delete(id)))).toBe(false);
    expect(
      Option.isNone(
        await run(
          Effect.flatMap(teamsRepo, (repo) =>
            repo.update(id, { name: teamName('X'), teamLeadId: null }),
          ),
        ),
      ),
    ).toBe(true);
  });
});

describe('DrizzlePublicHolidayRepository', () => {
  it('returns only the holidays inside the range, both ends included (AC-27)', async () => {
    await withDb((db) =>
      seedPublicHolidays(db, [
        makePublicHoliday({ holidayDate: '2026-12-24' }),
        makePublicHoliday({ holidayDate: '2026-12-25' }),
        makePublicHoliday({ holidayDate: '2026-12-31' }),
        makePublicHoliday({ holidayDate: '2027-01-01' }),
        makePublicHoliday({ holidayDate: '2027-01-02' }),
      ]),
    );

    const inRange = await run(
      Effect.flatMap(holidays, (repo) => repo.listInRange('2026-12-25', '2027-01-01')),
    );
    expect(inRange.map((h) => h.holidayDate)).toEqual(['2026-12-25', '2026-12-31', '2027-01-01']);
  });

  it('adds a holiday and refuses a second one on the same date (US-09)', async () => {
    const name = Schema.decodeSync(HolidayName);
    const added = await run(
      Effect.flatMap(holidays, (repo) =>
        repo.create({ holidayDate: '2026-12-25', name: name('Christmas Day') }),
      ),
    );
    expect(added).toMatchObject({ holidayDate: '2026-12-25', name: 'Christmas Day' });

    const duplicate = await runExit(
      Effect.flatMap(holidays, (repo) =>
        repo.create({ holidayDate: '2026-12-25', name: name('Again') }),
      ),
    );
    expect(duplicate).toEqual(Exit.fail(new DuplicateHolidayDate({ holidayDate: '2026-12-25' })));

    expect(
      Option.isSome(await run(Effect.flatMap(holidays, (repo) => repo.findById(added.id)))),
    ).toBe(true);
    expect(await run(Effect.flatMap(holidays, (repo) => repo.delete(added.id)))).toBe(true);
    expect(await run(Effect.flatMap(holidays, (repo) => repo.delete(added.id)))).toBe(false);
  });
});
