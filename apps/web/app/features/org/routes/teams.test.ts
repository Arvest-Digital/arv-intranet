import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { TEAM_MESSAGE } from '../team';
import { design, encoded, encodedTeam, kateryna, olena, page, platform } from '../test-data';
import { action, loader } from './teams';

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

const apiError = (_tag: string, code: string, message: string, status: number, details?: unknown) =>
  json({ error: { _tag, code, message, ...(details ? { details } : {}) } }, status);

const lead = { id: olena.id, fullName: olena.fullName, team: olena.team };

const submit = (api: ReturnType<typeof fakeApi>, fields: [string, string][]) =>
  action(
    args({
      context: api.context,
      request: new Request(`${WEB}/people/teams`, {
        method: 'POST',
        headers: { Origin: WEB },
        body: new URLSearchParams(fields),
      }),
    }),
  );

describe('teams loader', () => {
  it('loads the teams and the records that count their resources', async () => {
    const api = fakeApi((request) =>
      new URL(request.url).pathname === '/org/teams'
        ? json(page([platform, design].map(encodedTeam)))
        : json(page([encoded(olena), encoded(kateryna)])),
    );
    const result = await loader(
      args({ context: api.context, request: new Request(`${WEB}/people/teams`) }),
    );
    expect(result.teams.map((t) => t.name)).toEqual(['Platform', 'Design']);
    expect(result.records).toHaveLength(2);
  });

  it('refuses naming the missing permission when the api answers 403', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'org.missing_permission', 'x', 403));
    await expect(
      loader(args({ context: api.context, request: new Request(`${WEB}/people/teams`) })),
    ).rejects.toMatchObject({
      data: { reason: 'missing-permission', permission: 'manage employee records' },
      init: { status: 403 },
    });
  });
});

describe('teams action (AC-19d)', () => {
  it('creates a team with its lead, the name trimmed', async () => {
    const api = fakeApi(() => json(encodedTeam({ ...platform, teamLead: lead }), 201));
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', ' Platform '],
      ['teamLeadId', olena.id],
    ]);
    expect(result).toEqual({ ok: true, intent: 'create', teamId: platform.id });
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual(['POST', '/org/teams']);
    expect(await request.json()).toEqual({ name: 'Platform', teamLeadId: olena.id });
  });

  it('asks for a name and a lead before calling the api', async () => {
    const api = fakeApi(() => json({}));
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', '  '],
      ['teamLeadId', ''],
    ]);
    expect(result).toMatchObject({
      data: {
        ok: false,
        kind: 'invalid',
        fieldErrors: { name: TEAM_MESSAGE.name, teamLeadId: TEAM_MESSAGE.teamLead },
      },
      init: { status: 400 },
    });
    expect(api.requests).toHaveLength(0);
  });

  it('renames at the team, leaving an unchosen lead alone', async () => {
    const api = fakeApi(() => json(encodedTeam({ ...platform, name: 'Platform Core' })));
    await submit(api, [
      ['intent', 'update'],
      ['teamId', platform.id],
      ['name', 'Platform Core'],
      ['teamLeadId', ''],
    ]);
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual([
      'PATCH',
      `/org/teams/${platform.id}`,
    ]);
    expect(await request.json()).toEqual({ name: 'Platform Core' });
  });

  it('shows a duplicate name under the name', async () => {
    const api = fakeApi(() =>
      apiError(
        'Conflict',
        'org.duplicate_team_name',
        'A team named «Platform» already exists',
        409,
      ),
    );
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', 'platform '],
      ['teamLeadId', olena.id],
    ]);
    expect(result).toMatchObject({
      data: {
        ok: false,
        kind: 'invalid',
        intent: 'create',
        fieldErrors: { name: TEAM_MESSAGE.duplicate('platform') },
      },
      init: { status: 409 },
    });
  });

  it('names how many resources are still in a team it refuses to remove', async () => {
    const api = fakeApi(() =>
      apiError('Conflict', 'org.team_has_members', 'The team still has 2 resources', 409, {
        memberCount: 2,
      }),
    );
    const result = await submit(api, [
      ['intent', 'remove'],
      ['teamId', design.id],
      ['teamName', 'Design'],
    ]);
    expect(api.requests[0]!.method).toBe('DELETE');
    expect(result).toMatchObject({
      data: {
        ok: false,
        kind: 'error',
        teamId: design.id,
        error: 'Can’t remove Design — 2 resources are still in it.',
      },
    });
  });

  it('removes an empty team', async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    const result = await submit(api, [
      ['intent', 'remove'],
      ['teamId', design.id],
      ['teamName', 'Design'],
    ]);
    expect(result).toEqual({ ok: true, intent: 'remove', teamId: design.id });
  });

  it('refuses a write without the permission (403)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'org.missing_permission', 'x', 403));
    await expect(
      submit(api, [
        ['intent', 'remove'],
        ['teamId', design.id],
      ]),
    ).rejects.toMatchObject({ data: { reason: 'missing-permission' }, init: { status: 403 } });
  });
});
