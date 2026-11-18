import { env } from 'cloudflare:test';
import {
  makeAccessRole,
  makeEmployeeRecord,
  makePublicHoliday,
  makeSession,
  makeTeam,
  makeUser,
  seedAccessRoles,
  seedEmployeeRecords,
  seedPublicHolidays,
  seedSessions,
  seedTeams,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { CapacityImpactCheck, type OverbookedWeek } from '@arv/org';
import { orgRoutes } from '@arv/org/http';
import { Effect, Layer } from 'effect';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeAppLayer } from '../../../src/composition';
import type { AppEnv } from '../../../src/env';
import { authenticate } from '../../../src/middleware/authenticate';
import { requestDatabase } from '../../../src/middleware/request-database';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T13 — team and public-holiday endpoints (openapi.yaml `listTeams`, `createTeam`, `updateTeam`,
 * `deleteTeam`, `listPublicHolidays`, `createPublicHoliday`, `deletePublicHoliday`; AC-19d,
 * AC-27, AC-28, api-sync-report D-5) through the real Worker. The capacity warning is checked
 * against the host's own composition with `CapacityImpactCheck` stubbed; scheduling's real
 * check is covered in `composition/ports.test.ts`.
 */

beforeEach(resetDb);

const UNKNOWN_ID = '01933b8e-0000-7000-8000-00000000ffff';

type Call = { readonly method?: string; readonly token?: string; readonly body?: unknown };

const request = ({ method = 'GET', token, body }: Call = {}) => {
  const headers = new Headers();
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
};

const call = (path: string, init: Call = {}) => api(path, request(init));

/**
 * The host's authenticate + composition with org's routes, but `CapacityImpactCheck` reporting
 * `weeks` for every change (the stub merges last, so it wins over scheduling's).
 */
const callWithImpact = (weeks: ReadonlyArray<OverbookedWeek>, path: string, init: Call = {}) => {
  const stub = Layer.succeed(CapacityImpactCheck, {
    termsChange: () => Effect.succeed(weeks),
    holidayAdded: () => Effect.succeed(weeks),
  });
  const app = new Hono<AppEnv>()
    .use(authenticate())
    .use(async (c, next) => {
      const layer = makeAppLayer(c.env, c.get('actor'), requestDatabase(c));
      c.set('appLayer', Layer.merge(layer, stub) as Layer.Layer<never>);
      await next();
    })
    .route('/', orgRoutes);
  return app.request(path, request(init), env);
};

type TeamBody = {
  id: string;
  name: string;
  teamLead: { id: string; fullName: string; team: { id: string; name: string } | null } | null;
  createdAt: string;
};
type HolidayBody = { id: string; holidayDate: string; name: string; createdAt: string };
type PageBody<A> = { items: A[]; hasNext: boolean; hasPrev: boolean; nextCursor: string | null };
type ErrorBody = {
  _tag: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

const json = async <A>(res: Response) => (await res.json()) as A;
const errorOf = async (res: Response) => (await json<{ error: ErrorBody }>(res)).error;

/**
 * A manager (`org:manage-employee-records`), a holiday keeper (`org:manage-holiday-list`), a
 * board viewer (`scheduling:view-whole-board`) and a plain user, each with a session; the team
 * «Platform» led by Test User 1, who is in it.
 */
const setup = () =>
  withDb(async (db) => {
    const users = await seedUsers(db, [makeUser(), makeUser(), makeUser(), makeUser()]);
    const [manager, keeper, viewer] = users.map((u) => u!);
    const [managers, keepers, viewers] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Managers', permissionKeys: ['org:manage-employee-records'] }),
      makeAccessRole({ name: 'Holiday keepers', permissionKeys: ['org:manage-holiday-list'] }),
      makeAccessRole({ name: 'Board viewers', permissionKeys: ['scheduling:view-whole-board'] }),
    ]);
    await seedUserAccessRoles(db, [
      { userId: manager!.id, accessRoleId: managers!.id },
      { userId: keeper!.id, accessRoleId: keepers!.id },
      { userId: viewer!.id, accessRoleId: viewers!.id },
    ]);
    const sessions = await seedSessions(
      db,
      users.map((u) => makeSession({ userId: u!.id })),
    );
    const [managerToken, keeperToken, viewerToken, plainToken] = sessions.map((s) => s!.token);
    const [lead] = await seedEmployeeRecords(db, [
      makeEmployeeRecord({ fullName: 'Test User 1', lastChangedBy: manager!.id }),
    ]);
    const [platform] = await seedTeams(db, [makeTeam({ name: 'Platform', teamLeadId: lead!.id })]);
    await db.execute(`UPDATE org.employee_records SET team_id = '${platform!.id}'`);
    return {
      manager: managerToken!,
      keeper: keeperToken!,
      viewer: viewerToken!,
      plain: plainToken!,
      lead: lead!,
      platform: platform!,
    };
  });

const rows = (table: string) =>
  withDb(async (db) => (await db.execute(`SELECT * FROM org.${table} ORDER BY id`)).rows);

describe('teams (AC-19d)', () => {
  it('creates a team with a lead, renames it, and removes it once empty', async () => {
    const { manager, lead } = await setup();

    const created = await call('/org/teams', {
      method: 'POST',
      token: manager,
      body: { name: '  Data ', teamLeadId: lead.id },
    });
    expect(created.status).toBe(201);
    const team = await json<TeamBody>(created);
    expect(team).toMatchObject({
      name: 'Data',
      teamLead: { id: lead.id, fullName: 'Test User 1', team: { name: 'Platform' } },
    });

    const renamed = await call(`/org/teams/${team.id}`, {
      method: 'PATCH',
      token: manager,
      body: { name: 'Data Core' },
    });
    expect(renamed.status).toBe(200);
    expect(await json<TeamBody>(renamed)).toMatchObject({ id: team.id, name: 'Data Core' });

    const removed = await call(`/org/teams/${team.id}`, { method: 'DELETE', token: manager });
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');
    expect((await rows('teams')).map((t) => t.name)).toEqual(['Platform']);
  });

  it('409 org.duplicate_team_name for «platform » next to «Platform», on create and rename', async () => {
    const { manager, lead } = await setup();
    const res = await call('/org/teams', {
      method: 'POST',
      token: manager,
      body: { name: 'platform ', teamLeadId: lead.id },
    });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      _tag: 'Conflict',
      code: 'org.duplicate_team_name',
      message: 'A team named «platform» already exists',
    });

    const data = await json<TeamBody>(
      await call('/org/teams', {
        method: 'POST',
        token: manager,
        body: { name: 'Data', teamLeadId: lead.id },
      }),
    );
    const rename = await call(`/org/teams/${data.id}`, {
      method: 'PATCH',
      token: manager,
      body: { name: 'PLATFORM' },
    });
    expect(rename.status).toBe(409);
    expect((await errorOf(rename)).code).toBe('org.duplicate_team_name');
  });

  it('409 org.team_has_members naming how many resources remain', async () => {
    const { manager, platform } = await setup();
    const before = await rows('teams');

    const res = await call(`/org/teams/${platform.id}`, { method: 'DELETE', token: manager });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      _tag: 'Conflict',
      code: 'org.team_has_members',
      message: 'The team still has 1 resource',
      details: { memberCount: 1 },
    });
    expect(await rows('teams')).toEqual(before);
  });

  it('404 org.team_lead_not_found for a lead who is not an employee record', async () => {
    const { manager } = await setup();
    const res = await call('/org/teams', {
      method: 'POST',
      token: manager,
      body: { name: 'Data', teamLeadId: UNKNOWN_ID },
    });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: 'org.team_lead_not_found' });
  });

  it('404 org.team_not_found for a team that is gone', async () => {
    const { manager } = await setup();
    for (const method of ['PATCH', 'DELETE']) {
      const res = await call(`/org/teams/${UNKNOWN_ID}`, {
        method,
        token: manager,
        body: method === 'PATCH' ? { name: 'X' } : undefined,
      });
      expect(res.status).toBe(404);
      expect(await errorOf(res)).toEqual({
        _tag: 'NotFound',
        code: 'org.team_not_found',
        message: `Team ${UNKNOWN_ID} not found`,
      });
    }
  });

  it('400 for an empty change, a blank name or an unknown field', async () => {
    const { manager, platform, lead } = await setup();
    const bad = [
      call(`/org/teams/${platform.id}`, { method: 'PATCH', token: manager, body: {} }),
      call('/org/teams', {
        method: 'POST',
        token: manager,
        body: { name: ' ', teamLeadId: lead.id },
      }),
      call('/org/teams', {
        method: 'POST',
        token: manager,
        body: { name: 'Data', teamLeadId: lead.id, colour: 'red' },
      }),
    ];
    for (const res of await Promise.all(bad)) {
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe('platform.validation_failed');
    }
  });

  it('lists teams with their lead for a manager or a board viewer (D-5)', async () => {
    const { manager, viewer, lead } = await setup();
    for (const token of [manager, viewer]) {
      const res = await call('/org/teams', { token });
      expect(res.status).toBe(200);
      const page = await json<PageBody<TeamBody>>(res);
      expect(page).toMatchObject({ hasNext: false, hasPrev: false, nextCursor: null });
      expect(page.items).toEqual([
        expect.objectContaining({
          name: 'Platform',
          teamLead: {
            id: lead.id,
            fullName: 'Test User 1',
            team: expect.objectContaining({ name: 'Platform' }),
          },
        }),
      ]);
    }
  });

  it('403 org.missing_permission on every team operation for a holiday keeper, nothing changed', async () => {
    const { keeper, platform, lead } = await setup();
    const before = await rows('teams');
    const attempts = [
      call('/org/teams', { token: keeper }),
      call('/org/teams', {
        method: 'POST',
        token: keeper,
        body: { name: 'X', teamLeadId: lead.id },
      }),
      call(`/org/teams/${platform.id}`, { method: 'PATCH', token: keeper, body: { name: 'X' } }),
      call(`/org/teams/${platform.id}`, { method: 'DELETE', token: keeper }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toMatchObject({
        _tag: 'Forbidden',
        code: 'org.missing_permission',
      });
    }
    expect(await rows('teams')).toEqual(before);
  });
});

describe('public holidays (AC-27, AC-28)', () => {
  const monday = { holidayDate: '2026-12-28', name: 'Test holiday' };

  it('adds a holiday, lists it to any signed-in user by date, and removes it', async () => {
    const { keeper, plain } = await setup();
    await withDb((db) =>
      seedPublicHolidays(db, [makePublicHoliday({ holidayDate: '2026-12-31', name: 'Last day' })]),
    );

    const added = await call('/org/public-holidays', {
      method: 'POST',
      token: keeper,
      body: monday,
    });
    expect(added.status).toBe(201);
    const holiday = await json<HolidayBody>(added);
    expect(holiday).toMatchObject(monday);

    const listed = await call('/org/public-holidays?from=2026-12-01&to=2026-12-31', {
      token: plain,
    });
    expect(listed.status).toBe(200);
    const page = await json<PageBody<HolidayBody>>(listed);
    expect(page.items.map((h) => h.holidayDate)).toEqual(['2026-12-28', '2026-12-31']);

    const removed = await call(`/org/public-holidays/${holiday.id}`, {
      method: 'DELETE',
      token: keeper,
    });
    expect(removed.status).toBe(204);
    expect((await rows('public_holidays')).map((h) => h.name)).toEqual(['Last day']);
  });

  it('409 org.capacity_confirmation_required when the check reports impact; saved on confirm (AC-19c)', async () => {
    const { keeper, lead } = await setup();
    const weeks: OverbookedWeek[] = [
      { employeeId: lead.id, weekStart: '2026-12-28', overMinutes: 480 },
    ];

    const warned = await callWithImpact(weeks, '/org/public-holidays', {
      method: 'POST',
      token: keeper,
      body: monday,
    });
    expect(warned.status).toBe(409);
    expect(await errorOf(warned)).toEqual({
      _tag: 'ConfirmationRequired',
      code: 'org.capacity_confirmation_required',
      message: '1 resource-week would become overbooked',
      details: {
        overbookedWeeks: [
          {
            employee: {
              id: lead.id,
              fullName: 'Test User 1',
              team: expect.objectContaining({ name: 'Platform' }),
            },
            weekStart: '2026-12-28',
            overMinutes: 480,
          },
        ],
      },
    });
    expect(await rows('public_holidays')).toEqual([]);

    const confirmed = await callWithImpact(weeks, '/org/public-holidays', {
      method: 'POST',
      token: keeper,
      body: { ...monday, confirm: true },
    });
    expect(confirmed.status).toBe(201);
    expect(await rows('public_holidays')).toHaveLength(1);
  });

  it('409 org.duplicate_holiday_date for a date already on the list', async () => {
    const { keeper } = await setup();
    await withDb((db) =>
      seedPublicHolidays(db, [makePublicHoliday({ holidayDate: '2026-12-28' })]),
    );
    const res = await call('/org/public-holidays', { method: 'POST', token: keeper, body: monday });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      _tag: 'Conflict',
      code: 'org.duplicate_holiday_date',
      message: '2026-12-28 is already a public holiday',
    });
  });

  it('404 org.holiday_not_found for a holiday that is gone', async () => {
    const { keeper } = await setup();
    const res = await call(`/org/public-holidays/${UNKNOWN_ID}`, {
      method: 'DELETE',
      token: keeper,
    });
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('org.holiday_not_found');
  });

  it('403 without org:manage-holiday-list, even for a manager; the list is unchanged (AC-28)', async () => {
    const { manager } = await setup();
    const [seeded] = await withDb((db) =>
      seedPublicHolidays(db, [makePublicHoliday({ holidayDate: '2026-12-25' })]),
    );
    const before = await rows('public_holidays');
    const attempts = [
      call('/org/public-holidays', { method: 'POST', token: manager, body: monday }),
      call(`/org/public-holidays/${seeded!.id}`, { method: 'DELETE', token: manager }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toMatchObject({
        _tag: 'Forbidden',
        code: 'org.missing_permission',
        message: 'You lack the permission org:manage-holiday-list',
      });
    }
    expect(await rows('public_holidays')).toEqual(before);
  });

  it('400 for a date that is not a day or a range that is not a date', async () => {
    const { keeper } = await setup();
    const bad = await call('/org/public-holidays', {
      method: 'POST',
      token: keeper,
      body: { holidayDate: '2026-02-30', name: 'X' },
    });
    expect(bad.status).toBe(400);
    const range = await call('/org/public-holidays?from=tomorrow', { token: keeper });
    expect(range.status).toBe(400);
  });

  it('401 for an anonymous caller', async () => {
    expect((await call('/org/public-holidays')).status).toBe(401);
  });
});
