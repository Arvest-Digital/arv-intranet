import { IdentityApi } from '@arv/identity';
import type { EmployeeId, UserId } from '@arv/kernel';
import { Effect } from 'effect';
import type { EmployeeRecord } from '../../domain/employee-record';
import type { TeamId } from '../../domain/team';
import { EmployeeRecordRepository, TeamRepository } from '../ports';

// What the employee-record endpoints show beside a record: its team's name and who changed it
// last (openapi `EmployeeRecord`, `EmployeeRef`). Run after a use case has checked access; they
// check nothing themselves.

export interface TeamRef {
  readonly id: TeamId;
  readonly name: string;
}

/** A user who changed a record; `name` is null when the login was removed since. */
export interface ChangerRef {
  readonly id: UserId;
  readonly name: string | null;
}

export interface EmployeeRecordView {
  readonly record: EmployeeRecord;
  readonly team: TeamRef | null;
  readonly lastChangedBy: ChangerRef;
}

/** A resource as other answers name it (openapi `EmployeeRef`). */
export interface EmployeeRef {
  readonly id: EmployeeId;
  readonly fullName: string;
  readonly team: TeamRef | null;
}

/** Every team's name by id: one query, and the team list is short (tens of teams). */
const teamNames = Effect.gen(function* () {
  const teams = yield* TeamRepository;
  const all = yield* teams.list();
  return new Map(all.map(({ team }) => [team.id, team.name]));
});

const teamRef = (names: ReadonlyMap<TeamId, string>, id: TeamId | null): TeamRef | null => {
  const name = id === null ? undefined : names.get(id);
  return id === null || name === undefined ? null : { id, name };
};

/** The records with their team and last changer, in the same order. */
export const describeEmployeeRecords = (records: ReadonlyArray<EmployeeRecord>) =>
  Effect.gen(function* () {
    const identity = yield* IdentityApi;
    const teams = yield* teamNames;
    const changers = new Map(
      (yield* identity.userNames(records.map((r) => r.lastChangedBy))).map((u) => [u.id, u.name]),
    );
    return records.map(
      (record): EmployeeRecordView => ({
        record,
        team: teamRef(teams, record.teamId),
        lastChangedBy: {
          id: record.lastChangedBy,
          name: changers.get(record.lastChangedBy) ?? null,
        },
      }),
    );
  });

export const describeEmployeeRecord = (record: EmployeeRecord) =>
  describeEmployeeRecords([record]).pipe(Effect.map(([view]) => view as EmployeeRecordView));

/** The resources among `ids` as refs, by id; unknown ids are left out. */
export const employeeRefs = (ids: ReadonlyArray<EmployeeId>) =>
  Effect.gen(function* () {
    const records = yield* EmployeeRecordRepository;
    const found = yield* records.listByIds([...new Set(ids)]);
    const teams = yield* teamNames;
    return new Map(
      found.map((r): [EmployeeId, EmployeeRef] => [
        r.id,
        { id: r.id, fullName: r.fullName, team: teamRef(teams, r.teamId) },
      ]),
    );
  });
