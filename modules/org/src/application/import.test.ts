import { Effect, Exit, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EmployeeName } from '../domain/employee-record';
import {
  ContractHoursOutOfRange,
  EmploymentEndsBeforeStart,
  ImportedRecordInvalid,
} from '../domain/errors';
import { TeamName } from '../domain/team';
import type { ImportedEmployeeRecord } from './import';
import { OrgApi, OrgApiLive } from './org-api';
import { makeOrgFakes } from './testing';

const name = Schema.decodeSync(EmployeeName);
const team = Schema.decodeSync(TeamName);

const record = (
  overrides: Partial<Omit<ImportedEmployeeRecord, 'fullName'>> & { fullName: string },
): ImportedEmployeeRecord => ({
  contractMinutes: 2400,
  employmentStart: '2026-01-05',
  employmentEnd: null,
  teamName: null,
  ...overrides,
  fullName: name(overrides.fullName),
});

const setup = () => {
  const fakes = makeOrgFakes();
  const importer = fakes.seedLogin('Test Importer');
  const run = <A, E>(use: (org: OrgApi['Type']) => Effect.Effect<A, E>) =>
    Effect.runPromiseExit(
      Effect.flatMap(OrgApi, use).pipe(Effect.provide(OrgApiLive.pipe(Layer.provide(fakes.layer)))),
    );
  return { fakes, importer, run };
};

describe('OrgApi.importRecords (flow 13, AC-30)', () => {
  it('creates teams without a lead and records in input order, incomplete ones included', async () => {
    const { fakes, importer, run } = setup();
    const existing = fakes.seedTeam('Platform');

    const exit = await run((org) =>
      org.importRecords(
        {
          teams: [team('Design')],
          records: [
            record({ fullName: 'Test Zed', teamName: team(' platform ') }),
            record({
              fullName: 'Test Amy',
              teamName: team('Data'),
              contractMinutes: null,
              workingDays: [5, 1],
            }),
            record({ fullName: 'Test Bob', teamName: team('DATA'), employmentStart: null }),
            record({ fullName: 'Test Cy' }),
          ],
        },
        importer,
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    const { teams, records } = exit.value;
    expect(teams.map((t) => [t.name, t.created])).toEqual([
      ['Design', true],
      ['Platform', false],
      ['Data', true],
    ]);
    expect(teams[1]?.id).toBe(existing.id);
    const data = teams[2]!;
    expect(fakes.team(data.id)?.teamLeadId).toBeNull();

    expect(records.map((r) => [r.fullName, r.teamId])).toEqual([
      ['Test Zed', existing.id],
      ['Test Amy', data.id],
      ['Test Bob', data.id],
      ['Test Cy', null],
    ]);
    expect(records[1]).toMatchObject({ contractMinutes: null, workingDays: [1, 5] });
    expect(records[2]).toMatchObject({ employmentStart: null, workingDays: [1, 2, 3, 4, 5] });
    for (const r of records) {
      expect(fakes.record(r.employeeId)).toMatchObject({ lastChangedBy: importer, version: 1 });
    }
  });

  it('checks every record before writing: a broken AC-20 rule names the row, nothing is written', async () => {
    const { fakes, importer, run } = setup();

    const exit = await run((org) =>
      org.importRecords(
        {
          teams: [team('Design')],
          records: [
            record({ fullName: 'Test Fine' }),
            record({
              fullName: 'Test Broken',
              contractMinutes: 0,
              employmentStart: '2026-02-01',
              employmentEnd: '2026-01-01',
            }),
          ],
        },
        importer,
      ),
    );

    expect(exit).toEqual(
      Exit.fail(
        new ImportedRecordInvalid({
          index: 1,
          fullName: 'Test Broken',
          violations: [
            new ContractHoursOutOfRange({ contractMinutes: 0 }),
            new EmploymentEndsBeforeStart({
              employmentStart: '2026-02-01',
              employmentEnd: '2026-01-01',
            }),
          ],
        }),
      ),
    );
    expect(fakes.snapshot()).toEqual([]);
    expect(fakes.listsSnapshot().teams).toEqual([]);
  });
});
