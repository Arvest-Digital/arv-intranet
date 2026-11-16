import { EmployeeId } from '@arv/kernel';
import { Effect, Layer, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { OrgApi, OrgApiLive } from './org-api';
import { makeOrgFakes } from './testing';

const setup = () => {
  const fakes = makeOrgFakes();
  const manager = fakes.seedLogin();
  const platform = fakes.seedTeam('Platform');
  const leaver = fakes.seedRecord(
    {
      fullName: 'Test User 2',
      teamId: platform.id,
      contractMinutes: 1440,
      workingDays: [1, 2, 3],
      employmentStart: '2026-01-05',
      employmentEnd: '2026-12-15',
      userId: fakes.seedLogin(),
    },
    manager,
  );
  const stayer = fakes.seedRecord({ fullName: 'Test User 1', teamId: platform.id }, manager);
  const elsewhere = fakes.seedRecord({ fullName: 'Test User 3' }, manager);
  fakes.seedHoliday('2026-11-30', 'Before');
  fakes.seedHoliday('2026-12-25', 'Christmas Day');
  fakes.seedHoliday('2027-01-01', 'New Year');
  fakes.seedHoliday('2027-01-02', 'After');
  return { fakes, leaver, stayer, elsewhere };
};

const viaFacade = <A>(
  fakes: ReturnType<typeof makeOrgFakes>,
  use: (org: OrgApi['Type']) => Effect.Effect<A>,
) =>
  Effect.runPromise(
    Effect.flatMap(OrgApi, use).pipe(Effect.provide(OrgApiLive.pipe(Layer.provide(fakes.layer)))),
  );

describe('OrgApi', () => {
  it('employmentTerms: the asked resources with end dates unredacted, and the window’s holidays', async () => {
    const { fakes, leaver, stayer } = setup();

    const terms = await viaFacade(fakes, (org) =>
      org.employmentTerms(
        [leaver.id, stayer.id, EmployeeId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd')],
        {
          from: '2026-12-01',
          to: '2027-01-01',
        },
      ),
    );

    // Redaction happens in presenters (AC-22), so the facade always carries the end date.
    expect(terms.resources).toEqual([
      {
        employeeId: stayer.id,
        fullName: 'Test User 1',
        userId: null,
        teamId: stayer.teamId,
        contractMinutes: 2400,
        workingDays: [1, 2, 3, 4, 5],
        employmentStart: '2026-01-05',
        employmentEnd: null,
      },
      {
        employeeId: leaver.id,
        fullName: 'Test User 2',
        userId: leaver.userId,
        teamId: leaver.teamId,
        contractMinutes: 1440,
        workingDays: [1, 2, 3],
        employmentStart: '2026-01-05',
        employmentEnd: '2026-12-15',
      },
    ]);
    expect(terms.holidays).toEqual([
      { holidayDate: '2026-12-25', name: 'Christmas Day' },
      { holidayDate: '2027-01-01', name: 'New Year' },
    ]);
  });

  it('employeeByLogin: the linked resource, or none', async () => {
    const { fakes, leaver } = setup();
    const found = await viaFacade(fakes, (org) => org.employeeByLogin(leaver.userId!));
    const missing = await viaFacade(fakes, (org) => org.employeeByLogin(fakes.seedLogin()));
    expect(Option.map(found, (r) => [r.employeeId, r.employmentEnd])).toEqual(
      Option.some([leaver.id, '2026-12-15']),
    );
    expect(missing).toEqual(Option.none());
  });

  it('resourcesInTeam: only that team’s resources, by full name', async () => {
    const { fakes, leaver, stayer } = setup();
    const team = await viaFacade(fakes, (org) => org.resourcesInTeam(leaver.teamId!));
    expect(team.map((r) => r.employeeId)).toEqual([stayer.id, leaver.id]);
  });
});
