import { MySchedule } from '@arv/contracts/scheduling';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { mySchedule } from '../test-data';
import { loader } from './my-schedule';

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;
const body = (result: unknown) =>
  (result as { data?: unknown }).data ?? (result as Record<string, unknown>);

const load = (answer: () => Response, query = '') => {
  const fake = fakeApi(() => answer());
  const result = loader(
    args({ context: fake.context, request: new Request(`${WEB}/my-schedule${query}`) }),
  );
  return { fake, result };
};

describe('my schedule loader', () => {
  it('asks for the URL window and returns the own schedule (AC-17)', async () => {
    const { fake, result } = load(
      () => json(Schema.encodeSync(MySchedule)(mySchedule())),
      '?from=2026-11-18&weeks=4',
    );
    expect(body(await result)).toMatchObject({
      kind: 'schedule',
      weeks: 4,
      schedule: { employee: { fullName: 'Olena Kovalenko' } },
    });
    const call = new URL(fake.requests[0]?.url ?? '');
    expect(call.pathname).toBe('/scheduling/my-schedule');
    expect(Object.fromEntries(call.searchParams)).toEqual({ from: '2026-11-16', weeks: '4' });
  });

  it('tells a login with no employee record it is not set up (AC-18)', async () => {
    const { result } = load(() =>
      json(
        {
          error: {
            _tag: 'NotFound',
            code: 'scheduling.not_a_resource',
            message: 'You are not set up as a resource yet',
          },
        },
        404,
      ),
    );
    expect(body(await result)).toEqual({ kind: 'not-set-up' });
  });
});
