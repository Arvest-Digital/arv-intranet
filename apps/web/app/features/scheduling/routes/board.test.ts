import { Board, FreeList } from '@arv/contracts/scheduling';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { ATLAS, everyStateBoard, TEAM_DELIVERY, W47, W48 } from '../test-data';
import { loader } from './board';

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

const apiError = (_tag: string, code: string, message: string, status: number) =>
  json({ error: { _tag, code, message } }, status);

const encodedBoard = Schema.encodeSync(Board)(everyStateBoard());
const page = (items: unknown[]) =>
  json({ items, hasNext: false, hasPrev: false, nextCursor: null });

const encodedFreeList = Schema.encodeSync(FreeList)({
  from: '2026-11-18',
  to: '2026-11-29',
  weeks: [W47, W48],
  items: [],
  incompleteRecords: [],
});

/** Answers the board, teams and projects calls; `board` / `free` override those answers. */
function api(
  board: () => Response = () => json(encodedBoard),
  free: () => Response = () => json(encodedFreeList),
) {
  return fakeApi((request) => {
    const path = new URL(request.url).pathname;
    if (path === '/scheduling/board') return board();
    if (path === '/scheduling/free-list') return free();
    if (path === '/org/teams') {
      return page([{ ...TEAM_DELIVERY, teamLead: null, createdAt: '2026-10-31T09:00:00Z' }]);
    }
    if (path === '/projects') {
      return page([
        { ...ATLAS, closeDate: null, status: 'open', createdAt: '2026-10-31T09:00:00Z' },
      ]);
    }
    return json({}, 404);
  });
}

const load = (fake: ReturnType<typeof fakeApi>, query = '') =>
  loader(args({ context: fake.context, request: new Request(`${WEB}/schedule${query}`) }));

/** A loader result returned with `data()` carries its body in `.data`. */
const body = (result: unknown) =>
  (result as { data?: unknown }).data ?? (result as Record<string, unknown>);

describe('board loader', () => {
  it('passes the URL window and filters to getBoard (ADR-0002)', async () => {
    const fake = api();
    const result = await load(
      fake,
      `?from=2026-11-18&weeks=4&team=${TEAM_DELIVERY.id}&project=${ATLAS.id}&view=project`,
    );
    const boardCall = fake.requests.find((r) => new URL(r.url).pathname === '/scheduling/board');
    expect(Object.fromEntries(new URL(boardCall?.url ?? '').searchParams)).toEqual({
      from: '2026-11-16',
      weeks: '4',
      teamId: TEAM_DELIVERY.id,
      projectId: ATLAS.id,
    });
    expect(body(result)).toMatchObject({
      kind: 'board',
      params: { view: 'project', weeks: 4 },
      teams: [{ id: TEAM_DELIVERY.id, name: 'Delivery' }],
      projects: [{ id: ATLAS.id, name: 'Atlas CRM', type: 'client', status: 'open' }],
    });
  });

  it('asks for the default 12 weeks from the current week without params (AC-01)', async () => {
    const fake = api();
    await load(fake);
    const boardCall = fake.requests.find((r) => new URL(r.url).pathname === '/scheduling/board');
    expect(Object.fromEntries(new URL(boardCall?.url ?? '').searchParams)).toEqual({ weeks: '12' });
  });

  it('offers the own schedule when the board is refused (AC-03)', async () => {
    const fake = api(() =>
      apiError('Forbidden', 'platform.permission_denied', 'Missing permission', 403),
    );
    const result = await load(fake);
    expect(body(result)).toEqual({ kind: 'forbidden' });
    // Nothing else is read for a viewer who may not see the board.
    expect(fake.requests.map((r) => new URL(r.url).pathname)).toEqual(['/scheduling/board']);
  });

  it('shows the api message for a window out of range', async () => {
    const fake = api(() =>
      apiError(
        'ValidationError',
        'scheduling.window_out_of_range',
        'The board shows at most 12 months back and 52 weeks ahead',
        400,
      ),
    );
    expect(body(await load(fake, '?from=2020-01-06'))).toEqual({
      kind: 'out-of-range',
      message: 'The board shows at most 12 months back and 52 weeks ahead',
    });
  });

  it('sends an expired session to sign-in', async () => {
    const fake = api(() => apiError('Unauthenticated', 'identity.unauthenticated', 'Sign in', 401));
    const thrown = await load(fake, '?weeks=4').catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe(
      `/sign-in?${new URLSearchParams({ returnTo: '/schedule?weeks=4' })}`,
    );
  });

  it('asks who is free only when the drawer is open in the URL (AC-04)', async () => {
    const closed = api();
    expect(body(await load(closed, '?weeks=4'))).toMatchObject({ free: null });
    expect(closed.requests.map((r) => new URL(r.url).pathname)).not.toContain(
      '/scheduling/free-list',
    );

    const open = api();
    const result = await load(
      open,
      `?weeks=4&team=${TEAM_DELIVERY.id}&free=1&freeWeeks=3&minFreeHours=8`,
    );
    const freeCall = open.requests.find((r) => new URL(r.url).pathname === '/scheduling/free-list');
    // The board's window and filters do not narrow the free list.
    expect(Object.fromEntries(new URL(freeCall?.url ?? '').searchParams)).toEqual({
      weeks: '3',
      minFreeHours: '8',
    });
    expect(body(result)).toMatchObject({
      params: { free: { weeks: '3', minFreeHours: '8' } },
      free: { kind: 'list', list: { from: '2026-11-18', items: [] } },
    });
  });

  it('opens on 16 hours over 2 weeks without a query (AC-04)', async () => {
    const fake = api();
    await load(fake, '?free=1');
    const freeCall = fake.requests.find((r) => new URL(r.url).pathname === '/scheduling/free-list');
    expect(Object.fromEntries(new URL(freeCall?.url ?? '').searchParams)).toEqual({
      weeks: '2',
      minFreeHours: '16',
    });
  });

  it('passes a bad query through and shows the AC-05 message with no results', async () => {
    const message =
      'The number of weeks must be from 1 to 12 and the free hours must be zero or more';
    const fake = api(undefined, () =>
      json(
        {
          error: {
            _tag: 'ValidationError',
            code: 'platform.validation_failed',
            message,
            details: { issues: [{ path: 'weeks', message: 'Expected a number between 1 and 12' }] },
          },
        },
        400,
      ),
    );
    const result = await load(fake, '?free=1&freeWeeks=14&minFreeHours=16');
    const freeCall = fake.requests.find((r) => new URL(r.url).pathname === '/scheduling/free-list');
    expect(new URL(freeCall?.url ?? '').searchParams.get('weeks')).toBe('14');
    expect(body(result)).toMatchObject({
      kind: 'board',
      free: { kind: 'invalid', message, fields: ['weeks'] },
    });
  });
});
