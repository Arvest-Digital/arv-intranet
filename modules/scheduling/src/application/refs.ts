import { IdentityApi } from '@arv/identity';
import { type EmployeeId, Today, type UserId } from '@arv/kernel';
import { OrgApi, type TeamId, type TeamRef } from '@arv/org';
import { Effect } from 'effect';

// What the read endpoints show beside ids: team names, resource names and who changed something
// (openapi `TeamRef`, `EmployeeRef`, `UserRef`). Run after a query has checked access and redacted;
// they check nothing themselves and reveal nothing redaction removed.

/** A user who changed an allocation; `name` is null when the login was removed since. */
export interface ChangerRef {
  readonly id: UserId;
  readonly name: string | null;
}

/** A resource as the answers name it (openapi `EmployeeRef`). */
export interface EmployeeRef {
  readonly id: EmployeeId;
  readonly fullName: string;
  readonly team: TeamRef | null;
}

/** Lookups over the names one answer needs, fetched together. */
export interface Refs {
  readonly team: (id: TeamId | null) => TeamRef | null;
  readonly user: (id: UserId) => ChangerRef;
  /** Only for ids passed as `employeeIds`; an unknown one is a defect (records are never deleted). */
  readonly employee: (id: EmployeeId) => EmployeeRef;
}

export interface RefsRequest {
  readonly teamIds?: Iterable<TeamId | null>;
  readonly userIds?: Iterable<UserId>;
  /** Resources the answer names by id only; their names and teams are read from org. */
  readonly employeeIds?: Iterable<EmployeeId>;
}

/** Reads the teams, users and resources named in `request`: at most three facade calls. */
export const resolveRefs = (request: RefsRequest) =>
  Effect.gen(function* () {
    const org = yield* OrgApi;
    const identity = yield* IdentityApi;

    const employeeIds = [...new Set(request.employeeIds ?? [])];
    const resources =
      employeeIds.length === 0
        ? []
        : (yield* org.employmentTerms(employeeIds, yield* todayWindow)).resources;

    const teamIds = new Set<TeamId>();
    for (const id of request.teamIds ?? []) if (id !== null) teamIds.add(id);
    for (const r of resources) if (r.teamId !== null) teamIds.add(r.teamId);
    const teams = new Map(
      (teamIds.size === 0 ? [] : yield* org.teamsByIds([...teamIds])).map((t) => [t.id, t]),
    );

    const userIds = [...new Set(request.userIds ?? [])];
    const users = new Map(
      (userIds.length === 0 ? [] : yield* identity.userNames(userIds)).map((u) => [u.id, u.name]),
    );

    const team = (id: TeamId | null): TeamRef | null =>
      id === null ? null : (teams.get(id) ?? null);
    const employees = new Map(
      resources.map((r): [EmployeeId, EmployeeRef] => [
        r.employeeId,
        { id: r.employeeId, fullName: r.fullName, team: team(r.teamId) },
      ]),
    );
    const refs: Refs = {
      team,
      user: (id) => ({ id, name: users.get(id) ?? null }),
      employee: (id) => {
        const found = employees.get(id);
        if (found === undefined) throw new Error(`unknown employee ${id}`);
        return found;
      },
    };
    return refs;
  });

const todayWindow = Effect.flatMap(Today, (today) => today.date).pipe(
  Effect.map((date) => ({ from: date, to: date })),
);

/** The answer together with the names it needs. */
export interface WithRefs<A> {
  readonly value: A;
  readonly refs: Refs;
}

/** `value` with the refs `request(value)` names. */
export const withRefs =
  <A>(request: (value: A) => RefsRequest) =>
  (value: A) =>
    Effect.map(resolveRefs(request(value)), (refs): WithRefs<A> => ({ value, refs }));
