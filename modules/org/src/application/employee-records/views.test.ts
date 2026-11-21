import { EmployeeId, UserId } from '@arv/kernel';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeOrgFakes } from '../testing';
import { describeEmployeeRecords, employeeRefs } from './views';

describe('employee-record views', () => {
  it('attaches the team name and the changer’s name; a removed changer has none', async () => {
    const fakes = makeOrgFakes();
    const manager = fakes.seedLogin('Test User 2');
    const platform = fakes.seedTeam('Platform');
    const inTeam = fakes.seedRecord({ fullName: 'Test User 1', teamId: platform.id }, manager);
    const orphan = fakes.seedRecord(
      { fullName: 'Test User 3' },
      // A login removed from the intranet since it made the change.
      UserId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd'),
    );

    const views = await Effect.runPromise(
      describeEmployeeRecords([inTeam, orphan]).pipe(Effect.provide(fakes.layer)),
    );

    expect(views.map((v) => [v.team, v.lastChangedBy.name])).toEqual([
      [{ id: platform.id, name: 'Platform' }, 'Test User 2'],
      [null, null],
    ]);
  });

  it('employeeRefs names known resources with their team and skips unknown ids', async () => {
    const fakes = makeOrgFakes();
    const platform = fakes.seedTeam('Platform');
    const record = fakes.seedRecord(
      { fullName: 'Test User 1', teamId: platform.id },
      fakes.seedLogin(),
    );
    const unknown = EmployeeId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd');

    const refs = await Effect.runPromise(
      employeeRefs([record.id, unknown]).pipe(Effect.provide(fakes.layer)),
    );

    expect([...refs.values()]).toEqual([
      { id: record.id, fullName: 'Test User 1', team: { id: platform.id, name: 'Platform' } },
    ]);
  });
});
