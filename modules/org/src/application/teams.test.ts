import { Actor, CurrentActor, EmployeeId, Permission, PermissionDenied } from '@arv/kernel';
import { Effect, Either, type Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  DuplicateTeamName,
  TeamHasMembers,
  TeamLeadNotFound,
  TeamNotFound,
} from '../domain/errors';
import { TeamId, TeamName } from '../domain/team';
import { MANAGE_EMPLOYEE_RECORDS, MANAGE_HOLIDAY_LIST } from '../permissions';
import { changeTeam, createTeam, removeTeam } from './teams';
import { makeOrgFakes, type OrgFakes } from './testing';

const teamName = Schema.decodeSync(TeamName);
const unknownId = '01a135e4-c4d9-797e-ad76-ae23c85d58cd';

const setup = () => {
  const fakes = makeOrgFakes();
  const manager = fakes.seedLogin();
  const lead = fakes.seedRecord({ fullName: 'Test User 1' }, manager);
  return {
    fakes,
    lead,
    actor: Actor.User({ id: manager, permissions: new Set([MANAGE_EMPLOYEE_RECORDS]) }),
  };
};

type OrgServices = CurrentActor | Layer.Layer.Success<OrgFakes['layer']>;
type Probe = (
  lead: EmployeeId,
  team: TeamId,
) => Effect.Effect<unknown, { readonly _tag: string }, OrgServices>;

const run = <A, E>(fakes: OrgFakes, actor: Actor, effect: Effect.Effect<A, E, OrgServices>) =>
  Effect.runPromise(
    Effect.either(effect).pipe(
      Effect.provideService(CurrentActor, actor),
      Effect.provide(fakes.layer),
    ),
  );

const right = <A, E>(result: Either.Either<A, E>): A => {
  if (Either.isLeft(result))
    throw new Error(`expected success, got ${JSON.stringify(result.left)}`);
  return result.right;
};

describe('teams (AC-19d)', () => {
  it('creates «Platform» with a resource as its lead, then renames it', async () => {
    const { fakes, lead, actor } = setup();

    const created = right(
      await run(fakes, actor, createTeam({ name: teamName('Platform'), teamLeadId: lead.id })),
    );
    expect(created).toMatchObject({ name: 'Platform', teamLeadId: lead.id });

    const renamed = right(
      await run(fakes, actor, changeTeam(created.id, { name: teamName('Platform Core') })),
    );
    expect(renamed).toMatchObject({ id: created.id, name: 'Platform Core', teamLeadId: lead.id });
    expect(fakes.team(created.id)?.name).toBe('Platform Core');
  });

  it('refuses «platform » next to «Platform» on create and on rename', async () => {
    const { fakes, lead, actor } = setup();
    fakes.seedTeam('Platform', lead.id);
    const data = fakes.seedTeam('Data', lead.id);

    // Decoding trims the display form; the name key also ignores case.
    const onCreate = await run(
      fakes,
      actor,
      createTeam({ name: teamName('platform '), teamLeadId: lead.id }),
    );
    expect(onCreate).toEqual(Either.left(new DuplicateTeamName({ name: 'platform' })));

    const onRename = await run(fakes, actor, changeTeam(data.id, { name: teamName(' PLATFORM') }));
    expect(onRename).toEqual(Either.left(new DuplicateTeamName({ name: 'PLATFORM' })));
    expect(fakes.team(data.id)?.name).toBe('Data');
  });

  it('respelling a team’s own name is a rename', async () => {
    const { fakes, lead, actor } = setup();
    const platform = fakes.seedTeam('Platform', lead.id);
    const saved = right(
      await run(fakes, actor, changeTeam(platform.id, { name: teamName('PLATFORM') })),
    );
    expect(saved.name).toBe('PLATFORM');
  });

  it('changes the lead, keeping the name; the new lead must be a resource', async () => {
    const { fakes, lead, actor } = setup();
    const platform = fakes.seedTeam('Platform', lead.id);
    const next = fakes.seedRecord({ fullName: 'Test User 2' }, fakes.seedLogin());

    const saved = right(await run(fakes, actor, changeTeam(platform.id, { teamLeadId: next.id })));
    expect(saved).toMatchObject({ name: 'Platform', teamLeadId: next.id });

    const missing = EmployeeId.make(unknownId);
    const refused = await run(fakes, actor, changeTeam(platform.id, { teamLeadId: missing }));
    expect(refused).toEqual(Either.left(new TeamLeadNotFound({ id: missing })));
    expect(fakes.team(platform.id)?.teamLeadId).toBe(next.id);
  });

  it('refuses a lead who is not an employee record on create', async () => {
    const { fakes, actor } = setup();
    const missing = EmployeeId.make(unknownId);
    const result = await run(
      fakes,
      actor,
      createTeam({ name: teamName('Platform'), teamLeadId: missing }),
    );
    expect(result).toEqual(Either.left(new TeamLeadNotFound({ id: missing })));
    expect(fakes.listsSnapshot().teams).toEqual([]);
  });

  it('refuses to remove a team that still has resources, naming how many', async () => {
    const { fakes, lead, actor } = setup();
    const platform = fakes.seedTeam('Platform', lead.id);
    const manager = fakes.seedLogin();
    fakes.seedRecord({ fullName: 'Test User 2', teamId: platform.id }, manager);
    fakes.seedRecord({ fullName: 'Test User 3', teamId: platform.id }, manager);

    const result = await run(fakes, actor, removeTeam(platform.id));
    expect(result).toEqual(Either.left(new TeamHasMembers({ id: platform.id, memberCount: 2 })));
    expect(fakes.team(platform.id)).toBeDefined();
  });

  it('removes an empty team', async () => {
    const { fakes, lead, actor } = setup();
    const data = fakes.seedTeam('Data', lead.id);
    right(await run(fakes, actor, removeTeam(data.id)));
    expect(fakes.team(data.id)).toBeUndefined();
  });

  it('answers TeamNotFound for a team that is gone', async () => {
    const { fakes, actor } = setup();
    const gone = TeamId.make(unknownId);
    expect(await run(fakes, actor, changeTeam(gone, { name: teamName('X') }))).toEqual(
      Either.left(new TeamNotFound({ id: gone })),
    );
    expect(await run(fakes, actor, removeTeam(gone))).toEqual(
      Either.left(new TeamNotFound({ id: gone })),
    );
  });

  const probes: ReadonlyArray<readonly [string, Probe]> = [
    [
      'createTeam',
      (lead: EmployeeId, _: TeamId) => createTeam({ name: teamName('Mallory'), teamLeadId: lead }),
    ],
    ['changeTeam', (_: EmployeeId, id: TeamId) => changeTeam(id, { name: teamName('Mallory') })],
    ['removeTeam', (_: EmployeeId, id: TeamId) => removeTeam(id)],
  ];

  it.each(probes)('%s refuses a caller without org:manage-employee-records', async (_, make) => {
    const { fakes, lead } = setup();
    const platform = fakes.seedTeam('Platform', lead.id);
    const before = fakes.listsSnapshot();
    // Holding the holiday permission (or any other) is not enough.
    const actor = Actor.User({
      id: fakes.seedLogin(),
      permissions: new Set([MANAGE_HOLIDAY_LIST, Permission.make('scheduling:edit-allocations')]),
    });

    const result = await run(fakes, actor, make(lead.id, platform.id));
    expect(result).toEqual(
      Either.left(new PermissionDenied({ permission: MANAGE_EMPLOYEE_RECORDS })),
    );
    expect(fakes.listsSnapshot()).toEqual(before);
  });
});
