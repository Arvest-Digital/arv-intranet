import { IdentityApi } from '@arv/identity';
import { EmployeeId, UnitOfWork, UserId } from '@arv/kernel';
import { Effect, Exit, Layer, Option } from 'effect';
import type { CalendarDate } from '../domain/calendar';
import { EmployeeRecord } from '../domain/employee-record';
import {
  DuplicateHolidayDate,
  DuplicateTeamName,
  LoginAlreadyLinked,
  type OverbookedWeek,
} from '../domain/errors';
import { nameKey } from '../domain/name';
import { PublicHoliday, PublicHolidayId } from '../domain/public-holiday';
import { Team, TeamId } from '../domain/team';
import {
  CapacityImpactCheck,
  type EmployeeRecordInput,
  EmployeeRecordRepository,
  PublicHolidayRepository,
  TeamRepository,
} from './ports';

/**
 * In-memory fakes of every org port plus the `IdentityApi` facade, for use-case unit tests. One
 * shared store; the fake `UnitOfWork` restores it when the wrapped effect fails (like a Postgres
 * rollback). Ids are deterministic (`…0001`, `…0002`, …) and `lastChangedAt` is a fixed clock.
 *
 *   const fakes = makeOrgFakes();
 *   const login = fakes.seedLogin();
 *   await Effect.runPromise(useCase.pipe(Effect.provide(fakes.layer)));
 *
 * To make one method misbehave, provide `Layer.succeed(Port, { ...fakes.employeeRecords, … })`.
 */

interface Store {
  records: Map<EmployeeId, EmployeeRecord>;
  teams: Map<TeamId, Team>;
  holidays: Map<PublicHolidayId, PublicHoliday>;
  logins: Set<UserId>;
}

const cloneStore = (store: Store): Store => ({
  records: new Map(store.records),
  teams: new Map(store.teams),
  holidays: new Map(store.holidays),
  logins: new Set(store.logins),
});

const NOW = new Date('2026-11-16T09:00:00Z');

const byFullName = (a: EmployeeRecord, b: EmployeeRecord) =>
  a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id);

export const makeOrgFakes = () => {
  let store: Store = {
    records: new Map(),
    teams: new Map(),
    holidays: new Map(),
    logins: new Set(),
  };
  let sequence = 0;
  const nextUuid = () => `00000000-0000-7000-8000-${String(++sequence).padStart(12, '0')}`;

  /** What the fake capacity check answers; set it per test (default: nothing overbooks). */
  const impact = {
    weeks: [] as ReadonlyArray<OverbookedWeek>,
    calls: 0,
    /** The dates `holidayAdded` was asked about. */
    holidayDates: [] as Array<CalendarDate>,
  };

  const memberCount = (teamId: TeamId) =>
    [...store.records.values()].filter((r) => r.teamId === teamId).length;

  const holderOf = (userId: UserId | null, exceptId?: EmployeeId) =>
    userId === null
      ? undefined
      : [...store.records.values()].find((r) => r.userId === userId && r.id !== exceptId);

  const linked = (userId: UserId, holder: EmployeeRecord) =>
    new LoginAlreadyLinked({ userId, employeeId: holder.id, fullName: holder.fullName });

  const write = (
    id: EmployeeId,
    version: number,
    input: EmployeeRecordInput,
    changedBy: UserId,
    createdAt: Date,
  ) => {
    const record = new EmployeeRecord({
      ...input,
      id,
      version,
      lastChangedBy: changedBy,
      lastChangedAt: NOW,
      createdAt,
    });
    store.records.set(id, record);
    return record;
  };

  const employeeRecords: EmployeeRecordRepository['Type'] = {
    list: () => Effect.sync(() => [...store.records.values()].sort(byFullName)),
    listByIds: (ids) =>
      Effect.sync(() =>
        [...store.records.values()].filter((r) => ids.includes(r.id)).sort(byFullName),
      ),
    listByTeam: (teamId) =>
      Effect.sync(() =>
        [...store.records.values()].filter((r) => r.teamId === teamId).sort(byFullName),
      ),
    findById: (id) => Effect.sync(() => Option.fromNullable(store.records.get(id))),
    findByUserId: (userId) =>
      Effect.sync(() =>
        Option.fromNullable([...store.records.values()].find((r) => r.userId === userId)),
      ),
    create: (input, changedBy) =>
      Effect.suspend(() => {
        const holder = holderOf(input.userId);
        if (holder !== undefined && input.userId !== null) {
          return Effect.fail(linked(input.userId, holder));
        }
        return Effect.succeed(write(EmployeeId.make(nextUuid()), 1, input, changedBy, NOW));
      }),
    update: (id, expectedVersion, input, changedBy) =>
      Effect.suspend(() => {
        const holder = holderOf(input.userId, id);
        if (holder !== undefined && input.userId !== null) {
          return Effect.fail(linked(input.userId, holder));
        }
        const current = store.records.get(id);
        if (current === undefined || current.version !== expectedVersion) {
          return Effect.succeed(Option.none());
        }
        return Effect.succeed(
          Option.some(write(id, current.version + 1, input, changedBy, current.createdAt)),
        );
      }),
  };

  const teams: TeamRepository['Type'] = {
    list: () =>
      Effect.sync(() =>
        [...store.teams.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((team) => ({ team, memberCount: memberCount(team.id) })),
      ),
    findById: (id) =>
      Effect.sync(() =>
        Option.fromNullable(store.teams.get(id)).pipe(
          Option.map((team) => ({ team, memberCount: memberCount(team.id) })),
        ),
      ),
    findByNameKey: (key) =>
      Effect.sync(() =>
        Option.fromNullable([...store.teams.values()].find((t) => nameKey(t.name) === key)),
      ),
    create: (input) =>
      Effect.suspend(() => {
        if ([...store.teams.values()].some((t) => nameKey(t.name) === nameKey(input.name))) {
          return Effect.fail(new DuplicateTeamName({ name: input.name }));
        }
        const team = new Team({ ...input, id: TeamId.make(nextUuid()), createdAt: NOW });
        store.teams.set(team.id, team);
        return Effect.succeed(team);
      }),
    update: (id, input) =>
      Effect.suspend(() => {
        const team = store.teams.get(id);
        if (team === undefined) return Effect.succeed(Option.none());
        const taken = [...store.teams.values()].some(
          (t) => t.id !== id && nameKey(t.name) === nameKey(input.name),
        );
        if (taken) return Effect.fail(new DuplicateTeamName({ name: input.name }));
        const updated = new Team({ ...team, ...input });
        store.teams.set(id, updated);
        return Effect.succeed(Option.some(updated));
      }),
    delete: (id) => Effect.sync(() => store.teams.delete(id)),
  };

  const publicHolidays: PublicHolidayRepository['Type'] = {
    listInRange: (from, to) =>
      Effect.sync(() =>
        [...store.holidays.values()]
          .filter((h) => h.holidayDate >= from && h.holidayDate <= to)
          .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate)),
      ),
    findById: (id) => Effect.sync(() => Option.fromNullable(store.holidays.get(id))),
    create: (input) =>
      Effect.suspend(() => {
        if ([...store.holidays.values()].some((h) => h.holidayDate === input.holidayDate)) {
          return Effect.fail(new DuplicateHolidayDate({ holidayDate: input.holidayDate }));
        }
        const holiday = new PublicHoliday({
          ...input,
          id: PublicHolidayId.make(nextUuid()),
          createdAt: NOW,
        });
        store.holidays.set(holiday.id, holiday);
        return Effect.succeed(holiday);
      }),
    delete: (id) => Effect.sync(() => store.holidays.delete(id)),
  };

  const identity: IdentityApi['Type'] = {
    resolveActor: () => Effect.dieMessage('resolveActor is not used by org'),
    userExists: (id) => Effect.sync(() => store.logins.has(id)),
  };

  const capacityImpactCheck: CapacityImpactCheck['Type'] = {
    termsChange: () =>
      Effect.sync(() => {
        impact.calls += 1;
        return impact.weeks;
      }),
    holidayAdded: (holidayDate) =>
      Effect.sync(() => {
        impact.calls += 1;
        impact.holidayDates.push(holidayDate);
        return impact.weeks;
      }),
  };

  const unitOfWork: UnitOfWork['Type'] = {
    transactional: (effect) =>
      Effect.suspend(() => {
        const before = cloneStore(store);
        return effect.pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (Exit.isFailure(exit)) store = before;
            }),
          ),
        );
      }),
  };

  const layer = Layer.mergeAll(
    Layer.succeed(EmployeeRecordRepository, employeeRecords),
    Layer.succeed(TeamRepository, teams),
    Layer.succeed(PublicHolidayRepository, publicHolidays),
    Layer.succeed(IdentityApi, identity),
    Layer.succeed(CapacityImpactCheck, capacityImpactCheck),
    Layer.succeed(UnitOfWork, unitOfWork),
  );

  return {
    layer,
    employeeRecords,
    teams,
    publicHolidays,
    impact,
    /** An intranet login that exists in identity. */
    seedLogin: (): UserId => {
      const id = UserId.make(nextUuid());
      store.logins.add(id);
      return id;
    },
    seedTeam: (name: string, teamLeadId: EmployeeId | null = null): Team => {
      const team = new Team({ id: TeamId.make(nextUuid()), name, teamLeadId, createdAt: NOW });
      store.teams.set(team.id, team);
      return team;
    },
    seedRecord: (
      input: Partial<Omit<EmployeeRecordInput, 'fullName'>> & { readonly fullName: string },
      changedBy: UserId,
    ): EmployeeRecord =>
      write(
        EmployeeId.make(nextUuid()),
        1,
        {
          userId: null,
          teamId: null,
          contractMinutes: 2400,
          workingDays: [1, 2, 3, 4, 5],
          employmentStart: '2026-01-05',
          employmentEnd: null,
          ...input,
        } as EmployeeRecordInput,
        changedBy,
        NOW,
      ),
    seedHoliday: (holidayDate: CalendarDate, name: string): PublicHoliday => {
      const holiday = new PublicHoliday({
        id: PublicHolidayId.make(nextUuid()),
        holidayDate,
        name,
        createdAt: NOW,
      });
      store.holidays.set(holiday.id, holiday);
      return holiday;
    },
    /** The current record, read straight from the store. */
    record: (id: EmployeeId) => store.records.get(id),
    /** Every record, as plain data, so «nothing changed» is one deep comparison. */
    snapshot: () => [...store.records.values()].map((r) => ({ ...r })),
    /** The current team, read straight from the store. */
    team: (id: TeamId) => store.teams.get(id),
    /** Every team and holiday, as plain data, for «nothing changed» checks. */
    listsSnapshot: () => ({
      teams: [...store.teams.values()].map((t) => ({ ...t })),
      holidays: [...store.holidays.values()].map((h) => ({ ...h })),
    }),
  };
};

export type OrgFakes = ReturnType<typeof makeOrgFakes>;
