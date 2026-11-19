import { env } from 'cloudflare:test';
import {
  ImportCompletedDetails,
  ImportPreview,
  ImportProblemRowsDetails,
  ImportResult,
  ImportStatus,
  MissingPermissions,
} from '@arv/contracts/scheduling';
import { ApiErrorBody } from '@arv/contracts/shared';
import { DatabaseLive } from '@arv/db';
import {
  makeAccessRole,
  makeEmployeeRecord,
  makeProject,
  makeSession,
  makeUser,
  seedAccessRoles,
  seedEmployeeRecords,
  seedProjects,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { Actor, Permission, UserId } from '@arv/kernel';
import { Effect, Exit, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { importSpreadsheet } from '../../../../../modules/scheduling/src/application/import-commit';
import { AllocationHistoryRepository } from '../../../../../modules/scheduling/src/application/ports';
import { makeAppLayer } from '../../../src/composition';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T35 — the one-time import (openapi.yaml `getImportStatus`, `importSpreadsheet`; flow 13, AC-30–
 * AC-33, ADR-0010) through the real Worker and Postgres. Every body is decoded with its contract
 * schema, every error with `ApiErrorBody` and its `details` with the schema its `code` names.
 */

beforeEach(resetDb);

const HEADER =
  'Employee,Team,Contract hours,Working days,Employment start,Employment end,Project,Project type,Start,End,Hours,Per';
const line = (...cells: string[]) => cells.join(',');
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

/** Past and future rows: the import brings in the plan as it stands, history included. */
const CLEAN = csv(
  line(
    'Test Ada',
    'Platform',
    '40',
    'Mon-Fri',
    '2025-01-06',
    '',
    'Test Atlas',
    'client',
    '2026-01-05',
    '2026-01-30',
    '48',
    'week',
  ),
  line(
    'Test Ada',
    'Platform',
    '40',
    'Mon-Fri',
    '2025-01-06',
    '',
    'Test Orion',
    '',
    '2026-02-02',
    '2026-02-27',
    '8',
    'day',
  ),
  line(
    'Test Grace',
    'Platform',
    '',
    '',
    '',
    '',
    'Test Atlas',
    '',
    '2026-01-05',
    '2026-01-30',
    '4',
    'day',
  ),
  line(
    'Test Alan',
    '',
    '32',
    'Mon-Thu',
    '2024-03-01',
    '',
    'Test Annual leave',
    'leave',
    '2026-12-21',
    '2026-12-24',
    '',
    '',
  ),
);

const ALL = [
  'scheduling:edit-allocations',
  'org:manage-employee-records',
  'projects:manage-projects',
];

const setup = () =>
  withDb(async (db) => {
    const users = await seedUsers(db, [
      makeUser({ name: 'Test Importer' }),
      makeUser({ name: 'Test Planner' }),
    ]);
    const [importer, planner] = users.map((u) => u!);
    const [importers, planners] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Importers', permissionKeys: ALL }),
      makeAccessRole({ name: 'Planners', permissionKeys: ['scheduling:edit-allocations'] }),
    ]);
    await seedUserAccessRoles(db, [
      { userId: importer!.id, accessRoleId: importers!.id },
      { userId: planner!.id, accessRoleId: planners!.id },
    ]);
    const [importerToken = '', plannerToken = ''] = (
      await seedSessions(
        db,
        users.map((u) => makeSession({ userId: u!.id })),
      )
    ).map((s) => s!.token);
    // Already open: reused, not created again (AC-24).
    await seedProjects(db, [makeProject({ name: 'Test Orion', type: 'internal' })]);
    return { importer: importer!, importerToken, plannerToken };
  });

const upload = (token: string, text: string, confirm?: boolean) => {
  const form = new FormData();
  form.append('file', new File([text], 'plan.csv', { type: 'text/csv' }));
  if (confirm !== undefined) form.append('confirm', String(confirm));
  return api('/scheduling/import', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
};

const status = (token: string) =>
  api('/scheduling/import', { headers: { authorization: `Bearer ${token}` } });

const body = async <S extends Schema.Schema.AnyNoContext>(schema: S, res: Response) =>
  Schema.decodeUnknownSync(schema)(await res.json()) as Schema.Schema.Type<S>;

const errorOf = async (res: Response) => (await body(ApiErrorBody, res)).error;

const select = (text: string) => withDb(async (db) => (await db.execute(text)).rows);

const count = async (table: string) =>
  ((await select(`SELECT count(*)::int AS n FROM ${table}`))[0] as { n: number }).n;

const everything = async () => ({
  records: await count('org.employee_records'),
  teams: await count('org.teams'),
  projects: await count('projects.projects'),
  allocations: await count('scheduling.allocations'),
  segments: await count('scheduling.allocation_segments'),
  history: await count('scheduling.allocation_history'),
  runs: await count('scheduling.import_runs'),
});

const NOTHING = {
  records: 0,
  teams: 0,
  // The seeded open project.
  projects: 1,
  allocations: 0,
  segments: 0,
  history: 0,
  runs: 0,
};

describe('POST /scheduling/import', () => {
  it('an unconfirmed upload → 409 ConfirmationRequired with the preview; nothing created (AC-30)', async () => {
    const s = await setup();
    const res = await upload(s.importerToken, CLEAN);

    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'ConfirmationRequired',
      code: 'scheduling.import_confirmation_required',
      message: 'Review the import before confirming',
    });
    expect(Schema.decodeUnknownSync(ImportPreview)(error.details)).toEqual({
      employeeRecordsToCreate: 3,
      projectsToCreate: 2,
      allocationsToCreate: 4,
      incompleteRecords: 1,
      // Test Ada: 48 h a week on 40 in each week of January.
      overbookedWeeks: ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'].map(
        (weekStart) => ({ fullName: 'Test Ada', weekStart, overMinutes: 480 }),
      ),
    });
    expect(await everything()).toEqual(NOTHING);
  });

  it('a confirmed upload → 201 and everything created, stamped with the importer (AC-30)', async () => {
    const s = await setup();
    const res = await upload(s.importerToken, CLEAN, true);

    expect(res.status).toBe(201);
    const result = await body(ImportResult, res);
    expect(result).toMatchObject({
      importedBy: { id: s.importer.id, name: 'Test Importer' },
      employeeRecordsCreated: 3,
      projectsCreated: 2,
      allocationsCreated: 4,
    });

    expect(await everything()).toEqual({
      records: 3,
      teams: 1,
      projects: 3,
      allocations: 4,
      segments: 4,
      history: 4,
      runs: 1,
    });
    expect(
      await select(
        `SELECT DISTINCT change_kind, effective_from, before_values, changed_by
           FROM scheduling.allocation_history`,
      ),
    ).toEqual([
      {
        change_kind: 'imported',
        effective_from: null,
        before_values: null,
        changed_by: s.importer.id,
      },
    ]);
    expect(
      await select(
        `SELECT r.full_name, p.name AS project, s.starts_on::text, s.ends_on::text, s.rate_minutes, s.rate_period,
                a.version, a.last_changed_by
           FROM scheduling.allocations a
           JOIN scheduling.allocation_segments s ON s.allocation_id = a.id
           JOIN org.employee_records r ON r.id = a.employee_id
           JOIN projects.projects p ON p.id = a.project_id
          ORDER BY r.full_name, s.starts_on`,
      ),
    ).toEqual(
      [
        ['Test Ada', 'Test Atlas', '2026-01-05', '2026-01-30', 2880, 'week'],
        ['Test Ada', 'Test Orion', '2026-02-02', '2026-02-27', 480, 'day'],
        ['Test Alan', 'Test Annual leave', '2026-12-21', '2026-12-24', null, 'full-day'],
        ['Test Grace', 'Test Atlas', '2026-01-05', '2026-01-30', 240, 'day'],
      ].map(([full_name, project, starts_on, ends_on, rate_minutes, rate_period]) => ({
        full_name,
        project,
        starts_on,
        ends_on,
        rate_minutes,
        rate_period,
        version: 1,
        last_changed_by: s.importer.id,
      })),
    );

    const after = await body(ImportStatus, await status(s.importerToken));
    expect(after).toEqual({ completed: true, run: result });
  });

  it('a second import → 409 with the one-time message (AC-32)', async () => {
    const s = await setup();
    const first = await body(ImportResult, await upload(s.importerToken, CLEAN, true));

    const res = await upload(s.importerToken, CLEAN, false);

    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'Conflict',
      code: 'scheduling.import_already_completed',
      message: 'The import is one-time; make later changes on the board',
    });
    expect(Schema.decodeUnknownSync(ImportCompletedDetails)(error.details)).toEqual({
      completedAt: first.createdAt,
    });
    expect(await count('scheduling.import_runs')).toBe(1);
  });

  it('problem rows → 400 import_problem_rows listing each, nothing created (AC-31)', async () => {
    const s = await setup();
    await withDb((db) =>
      seedEmployeeRecords(db, [
        makeEmployeeRecord({ fullName: 'Test Ada', lastChangedBy: s.importer.id }),
      ]),
    );
    const res = await upload(
      s.importerToken,
      csv(
        line(
          'Test Ada',
          '',
          '40',
          '',
          '2025-01-06',
          '',
          'Test Atlas',
          '',
          '2026-01-05',
          '2026-01-30',
          '8',
          'day',
        ),
        line(
          'Test Bob',
          '',
          '40',
          '',
          '2025-01-06',
          '',
          'Test Atlas',
          '',
          '2026-01-05',
          '2026-01-30',
          '',
          'day',
        ),
      ),
      true,
    );

    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'ValidationError',
      code: 'scheduling.import_problem_rows',
      message: '2 rows need fixing; nothing was imported',
    });
    expect(Schema.decodeUnknownSync(ImportProblemRowsDetails)(error.details).rows).toEqual([
      {
        row: 2,
        reason: 'similar_name',
        message: '«Test Ada» already has an employee record; the import only creates new ones',
      },
      { row: 3, reason: 'empty_hours', message: 'Hours are empty' },
    ]);
    expect(await count('scheduling.allocations')).toBe(0);
    expect(await count('org.employee_records')).toBe(1);
  });

  it('a file that is not the planning spreadsheet → 400 platform.validation_failed', async () => {
    const s = await setup();
    const res = await upload(s.importerToken, 'Name,Hours\nTest Ada,8');
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({
      code: 'platform.validation_failed',
      message: 'The header row lacks the columns «Project», «Start», «End»',
    });
  });

  it('no file part → 400 platform.validation_failed', async () => {
    const s = await setup();
    const res = await api('/scheduling/import', {
      method: 'POST',
      headers: { authorization: `Bearer ${s.importerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('platform.validation_failed');
  });

  it('missing permissions → 403 naming every one (AC-33)', async () => {
    const s = await setup();
    const res = await upload(s.plannerToken, CLEAN, true);

    expect(res.status).toBe(403);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'Forbidden',
      code: 'scheduling.missing_permission',
      message: 'You lack the permissions: manage employee records, manage projects',
    });
    expect(Schema.decodeUnknownSync(MissingPermissions)(error.details)).toEqual({
      missingPermissions: ['org:manage-employee-records', 'projects:manage-projects'],
    });
    expect(await everything()).toEqual(NOTHING);
  });

  it('no session → 401', async () => {
    await setup();
    const res = await upload('not-a-token', CLEAN, true);
    expect(res.status).toBe(401);
  });
});

describe('GET /scheduling/import (AC-32)', () => {
  it('reports no completed import before the import', async () => {
    const s = await setup();
    const res = await status(s.plannerToken);
    expect(res.status).toBe(200);
    expect(await body(ImportStatus, res)).toEqual({ completed: false, run: null });
  });
});

describe('the commit in one unit of work (ADR-0006)', () => {
  it('a failure after the allocations are written leaves nothing in any schema', async () => {
    const s = await setup();
    const actor = Actor.User({
      id: UserId.make(s.importer.id),
      permissions: new Set(ALL.map((p) => Permission.make(p))),
    });
    const appLayer = makeAppLayer(env, actor, DatabaseLive(env.HYPERDRIVE.connectionString));

    // The real repositories, except that the history write fails after allocations were written.
    const exit = await Effect.runPromiseExit(
      importSpreadsheet({
        file: { size: CLEAN.length, text: async () => CLEAN },
        confirm: true,
      }).pipe(
        Effect.provideServiceEffect(
          AllocationHistoryRepository,
          Effect.map(AllocationHistoryRepository, (real) => ({
            ...real,
            appendMany: () => Effect.dieMessage('history write failed mid-commit'),
          })),
        ),
        Effect.provide(appLayer),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(await everything()).toEqual(NOTHING);
  });
});
