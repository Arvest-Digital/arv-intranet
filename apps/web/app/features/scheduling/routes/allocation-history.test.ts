import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { HISTORY_MESSAGE } from '../history';
import { ATLAS_ALLOCATION, atlasHistory } from '../test-data';
import { loader } from './allocation-history';

const WEB = 'http://web.test';

const load = (api: ReturnType<typeof fakeApi>, allocationId: string) =>
  loader({
    context: api.context,
    params: { allocationId },
    request: new Request(`${WEB}/schedule/allocations/${allocationId}/history`),
  } as never);

const body = (result: unknown) =>
  (result as { data?: unknown }).data ?? (result as Record<string, unknown>);

const page = (items: ReadonlyArray<unknown>, nextCursor: string | null) => ({
  items,
  hasNext: nextCursor !== null,
  hasPrev: false,
  nextCursor,
});

describe('allocation history loader (AC-16)', () => {
  it('follows every page and answers newest first', async () => {
    const [imported, trimmed, changed] = atlasHistory;
    const api = fakeApi((request) =>
      new URL(request.url).searchParams.get('after')
        ? json(page([changed], null))
        : json(page([imported, trimmed], trimmed!.id)),
    );
    const result = await load(api, ATLAS_ALLOCATION);
    expect(body(result)).toEqual({ kind: 'list', entries: [changed, trimmed, imported] });
    expect(new URL(api.requests[0]!.url).pathname).toBe(
      `/scheduling/allocations/${ATLAS_ALLOCATION}/history`,
    );
    expect(new URL(api.requests[1]!.url).searchParams.get('after')).toBe(trimmed!.id);
  });

  it('says the permission is missing (AC-12b)', async () => {
    const api = fakeApi(() =>
      json(
        {
          error: {
            _tag: 'Forbidden',
            code: 'scheduling.missing_permission',
            message: 'You lack the permission to view the whole board',
          },
        },
        403,
      ),
    );
    expect(body(await load(api, ATLAS_ALLOCATION))).toEqual({
      kind: 'error',
      message: HISTORY_MESSAGE.forbidden,
    });
  });

  it('answers «gone» for an id that is not one, without calling the api', async () => {
    const api = fakeApi(() => json(page([], null)));
    expect(body(await load(api, 'nope'))).toEqual({ kind: 'error', message: HISTORY_MESSAGE.gone });
    expect(api.requests).toHaveLength(0);
  });
});
