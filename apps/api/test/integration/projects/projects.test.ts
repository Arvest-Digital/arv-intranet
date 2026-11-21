import { env } from 'cloudflare:test';
import {
  makeAccessRole,
  makeProject,
  makeSession,
  makeUser,
  seedAccessRoles,
  seedProjects,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { calendarDateIn } from '@arv/kernel';
import { type ClosingImpact, ProjectClosingHook } from '@arv/projects';
import { projectsRoutes } from '@arv/projects/http';
import { Effect, Layer } from 'effect';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeAppLayer } from '../../../src/composition';
import type { AppEnv } from '../../../src/env';
import { authenticate } from '../../../src/middleware/authenticate';
import { requestDatabase } from '../../../src/middleware/request-database';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T17 — project endpoints (openapi.yaml `listProjects`, `createProject`, `closeProject`; AC-23–
 * AC-26, AC-29) through the real Worker. The closing preview is checked against the host's own
 * composition with `ProjectClosingHook` stubbed; scheduling's real hook is covered in
 * `composition/ports.test.ts`.
 */

beforeEach(resetDb);

const UNKNOWN_ID = '01933b8e-0000-7000-8000-00000000ffff';

/** Today and its neighbours in the Worker's company time zone (wrangler `COMPANY_TIME_ZONE`). */
const day = (offset: number) =>
  calendarDateIn(env.COMPANY_TIME_ZONE)(Date.now() + offset * 24 * 60 * 60 * 1000);

type Call = { readonly method?: string; readonly token?: string; readonly body?: unknown };

const request = ({ method = 'GET', token, body }: Call = {}) => {
  const headers = new Headers();
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
};

const call = (path: string, init: Call = {}) => api(path, request(init));

/** The host's authenticate + composition with projects' routes, the closing hook answering `impact`. */
const callWithImpact = (impact: ClosingImpact, path: string, init: Call = {}) => {
  const stub = Layer.succeed(ProjectClosingHook, {
    preview: () => Effect.succeed(impact),
    apply: () => Effect.void,
  });
  const app = new Hono<AppEnv>()
    .use(authenticate())
    .use(async (c, next) => {
      const layer = makeAppLayer(c.env, c.get('actor'), requestDatabase(c));
      c.set('appLayer', Layer.merge(layer, stub) as Layer.Layer<never>);
      await next();
    })
    .route('/', projectsRoutes);
  return app.request(path, request(init), env);
};

type ProjectBody = {
  id: string;
  name: string;
  type: string;
  closeDate: string | null;
  status: 'open' | 'closed';
  createdAt: string;
};
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
 * A manager (`projects:manage-projects`), a board viewer (`scheduling:view-whole-board`), a
 * viewer who also sees leave reasons, a planner (`scheduling:edit-allocations`) and a plain user,
 * each with a session; the projects «Atlas» (open), «Borealis» (closed yesterday) and the leave
 * project «Sick leave».
 */
const setup = () =>
  withDb(async (db) => {
    const users = await seedUsers(db, [makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
    const [manager, viewer, reasonsViewer, planner] = users.map((u) => u!);
    const [managers, viewers, reasons, planners] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Project managers', permissionKeys: ['projects:manage-projects'] }),
      makeAccessRole({ name: 'Board viewers', permissionKeys: ['scheduling:view-whole-board'] }),
      makeAccessRole({
        name: 'Leave readers',
        permissionKeys: ['scheduling:view-whole-board', 'scheduling:see-leave-reasons'],
      }),
      makeAccessRole({ name: 'Planners', permissionKeys: ['scheduling:edit-allocations'] }),
    ]);
    await seedUserAccessRoles(db, [
      { userId: manager!.id, accessRoleId: managers!.id },
      { userId: viewer!.id, accessRoleId: viewers!.id },
      { userId: reasonsViewer!.id, accessRoleId: reasons!.id },
      { userId: planner!.id, accessRoleId: planners!.id },
    ]);
    const sessions = await seedSessions(
      db,
      users.map((u) => makeSession({ userId: u!.id })),
    );
    const tokens = sessions.map((s) => s!.token);
    const [atlas, borealis, sickLeave] = await seedProjects(db, [
      makeProject({ name: 'Atlas' }),
      makeProject({ name: 'Borealis', type: 'internal', closeDate: day(-1) }),
      makeProject({ name: 'Sick leave', type: 'leave' }),
    ]);
    return {
      manager: tokens[0]!,
      viewer: tokens[1]!,
      reasonsViewer: tokens[2]!,
      planner: tokens[3]!,
      plain: tokens[4]!,
      atlas: atlas!,
      borealis: borealis!,
      sickLeave: sickLeave!,
    };
  });

const rows = () =>
  withDb(
    async (db) =>
      (await db.execute('SELECT name, type, close_date FROM projects.projects ORDER BY name')).rows,
  );

const listNames = async (token: string, query = '') => {
  const res = await call(`/projects${query}`, { token });
  expect(res.status).toBe(200);
  return (await json<PageBody<ProjectBody>>(res)).items.map((p) => p.name);
};

describe('listProjects (AC-25, AC-29)', () => {
  it('lists projects by name with their status today', async () => {
    const { manager, atlas } = await setup();

    const res = await call('/projects', { token: manager });
    expect(res.status).toBe(200);
    const page = await json<PageBody<ProjectBody>>(res);
    expect(page).toMatchObject({ hasNext: false, hasPrev: false, nextCursor: null });
    expect(page.items.map((p) => [p.name, p.status])).toEqual([
      ['Atlas', 'open'],
      ['Borealis', 'closed'],
      ['Sick leave', 'open'],
    ]);
    expect(page.items[0]).toEqual({
      id: atlas.id,
      name: 'Atlas',
      type: 'client',
      closeDate: null,
      status: 'open',
      createdAt: expect.any(String),
    });
  });

  it('leaves leave projects out for a viewer without see-leave-reasons (AC-29)', async () => {
    const { viewer } = await setup();
    expect(await listNames(viewer)).toEqual(['Atlas', 'Borealis']);
    expect(await listNames(viewer, '?type=leave')).toEqual([]);
  });

  it('offers leave projects to a viewer with see-leave-reasons and to a planner booking leave', async () => {
    const { reasonsViewer, planner } = await setup();
    expect(await listNames(reasonsViewer, '?type=leave')).toEqual(['Sick leave']);
    expect(await listNames(planner, '?type=leave')).toEqual(['Sick leave']);
  });

  it('filters by status and pages by cursor', async () => {
    const { manager, atlas } = await setup();
    expect(await listNames(manager, '?status=closed')).toEqual(['Borealis']);

    const first = await json<PageBody<ProjectBody>>(
      await call('/projects?limit=1', { token: manager }),
    );
    expect(first).toMatchObject({ hasNext: true, hasPrev: false, nextCursor: atlas.id });
    expect(await listNames(manager, `?limit=1&after=${atlas.id}`)).toEqual(['Borealis']);
  });

  it('403 projects.missing_permission for a user with no reader permission', async () => {
    const { plain } = await setup();
    const res = await call('/projects', { token: plain });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toMatchObject({
      _tag: 'Forbidden',
      code: 'projects.missing_permission',
      details: { missingPermissions: ['projects:manage-projects'] },
    });
  });

  it('400 for an unknown status, 401 without a session', async () => {
    const { manager } = await setup();
    expect((await call('/projects?status=archived', { token: manager })).status).toBe(400);
    expect((await call('/projects')).status).toBe(401);
  });
});

describe('createProject (AC-23, AC-24, AC-26)', () => {
  it('creates an open project with a trimmed name', async () => {
    const { manager } = await setup();
    const res = await call('/projects', {
      method: 'POST',
      token: manager,
      body: { name: '  Test Project ', type: 'client' },
    });
    expect(res.status).toBe(201);
    expect(await json<ProjectBody>(res)).toMatchObject({
      name: 'Test Project',
      type: 'client',
      closeDate: null,
      status: 'open',
    });
    expect(await listNames(manager)).toContain('Test Project');
  });

  it('409 projects.duplicate_open_name for «atlas » next to the open «Atlas» (AC-24)', async () => {
    const { manager } = await setup();
    const before = await rows();
    const res = await call('/projects', {
      method: 'POST',
      token: manager,
      body: { name: 'atlas ', type: 'internal' },
    });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      _tag: 'Conflict',
      code: 'projects.duplicate_open_name',
      message: 'An open project named «atlas» already exists',
    });
    expect(await rows()).toEqual(before);
  });

  it('reuses the name of a closed project', async () => {
    const { manager } = await setup();
    const res = await call('/projects', {
      method: 'POST',
      token: manager,
      body: { name: 'Borealis', type: 'client' },
    });
    expect(res.status).toBe(201);
  });

  it('403 projects.missing_permission without manage-projects, nothing created (AC-26)', async () => {
    const { planner } = await setup();
    const before = await rows();
    const res = await call('/projects', {
      method: 'POST',
      token: planner,
      body: { name: 'Zenith', type: 'client' },
    });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toMatchObject({
      _tag: 'Forbidden',
      code: 'projects.missing_permission',
      details: { missingPermissions: ['projects:manage-projects'] },
    });
    expect(await rows()).toEqual(before);
  });

  it('400 platform.validation_failed for a blank name or an unknown field', async () => {
    const { manager } = await setup();
    for (const body of [
      { name: '  ', type: 'client' },
      { name: 'Zenith', type: 'client', closeDate: null },
    ]) {
      const res = await call('/projects', { method: 'POST', token: manager, body });
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe('platform.validation_failed');
    }
  });
});

describe('closeProject (AC-25, AC-26)', () => {
  const impact: ClosingImpact = {
    endingAtCloseDate: [
      {
        allocationId: '01933b8e-0000-7000-8000-000000000601',
        employee: {
          id: '01933b8e-0000-7000-8000-000000000301',
          fullName: 'Test User 1',
          team: null,
        },
        startsOn: day(-7),
        endsOn: day(60),
      },
    ],
    removed: [],
  };

  it('records the close date when nothing needs trimming; the project stays open through it', async () => {
    const { manager, atlas } = await setup();
    const res = await call(`/projects/${atlas.id}/close`, {
      method: 'POST',
      token: manager,
      body: { closeDate: day(0) },
    });
    expect(res.status).toBe(200);
    expect(await json<ProjectBody>(res)).toMatchObject({
      id: atlas.id,
      closeDate: day(0),
      status: 'open',
    });
  });

  it('409 projects.closing_confirmation_required without confirm, nothing saved', async () => {
    const { manager, atlas } = await setup();
    const closeDate = day(14);
    const res = await callWithImpact(impact, `/projects/${atlas.id}/close`, {
      method: 'POST',
      token: manager,
      body: { closeDate },
    });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      _tag: 'ConfirmationRequired',
      code: 'projects.closing_confirmation_required',
      message: `1 allocation will end on ${closeDate} and 0 will be removed`,
      details: { closeDate, ...impact },
    });
    expect((await rows()).find((r) => r.name === 'Atlas')?.close_date).toBeNull();

    const confirmed = await callWithImpact(impact, `/projects/${atlas.id}/close`, {
      method: 'POST',
      token: manager,
      body: { closeDate, confirm: true },
    });
    expect(confirmed.status).toBe(200);
    expect((await json<ProjectBody>(confirmed)).closeDate).toBe(closeDate);
  });

  it('400 projects.close_date_in_past for a close date before today', async () => {
    const { manager, atlas } = await setup();
    const res = await call(`/projects/${atlas.id}/close`, {
      method: 'POST',
      token: manager,
      body: { closeDate: day(-1) },
    });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      _tag: 'ValidationError',
      code: 'projects.close_date_in_past',
      message: 'The close date cannot be earlier than today; past plans are never rewritten',
      details: { rules: ['close_date_before_today'] },
    });
  });

  it('409 projects.project_closed for a project already closed', async () => {
    const { manager, borealis } = await setup();
    const res = await call(`/projects/${borealis.id}/close`, {
      method: 'POST',
      token: manager,
      body: { closeDate: day(10) },
    });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('projects.project_closed');
  });

  it('404 projects.project_not_found for an unknown project', async () => {
    const { manager } = await setup();
    const res = await call(`/projects/${UNKNOWN_ID}/close`, {
      method: 'POST',
      token: manager,
      body: { closeDate: day(1) },
    });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({
      _tag: 'NotFound',
      code: 'projects.project_not_found',
      message: `Project ${UNKNOWN_ID} not found`,
    });
  });

  it('403 projects.missing_permission without manage-projects, nothing changed (AC-26)', async () => {
    const { viewer, atlas } = await setup();
    const before = await rows();
    const res = await call(`/projects/${atlas.id}/close`, {
      method: 'POST',
      token: viewer,
      body: { closeDate: day(1) },
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('projects.missing_permission');
    expect(await rows()).toEqual(before);
  });
});
