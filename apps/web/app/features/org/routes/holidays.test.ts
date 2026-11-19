import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { HOLIDAY_MESSAGE } from '../holiday';
import { olena, page } from '../test-data';
import { action, loader } from './holidays';

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

const apiError = (_tag: string, code: string, message: string, status: number, details?: unknown) =>
  json({ error: { _tag, code, message, ...(details ? { details } : {}) } }, status);

const christmas = {
  id: '5e6f7081-9203-4a4b-8c5d-6e7f8091a201',
  holidayDate: '2026-12-25',
  name: 'Christmas Day',
  createdAt: '2026-11-01T10:00:00.000Z',
};

const submit = (api: ReturnType<typeof fakeApi>, fields: [string, string][]) =>
  action(
    args({
      context: api.context,
      request: new Request(`${WEB}/holidays`, {
        method: 'POST',
        headers: { Origin: WEB },
        body: new URLSearchParams(fields),
      }),
    }),
  );

const addFields: [string, string][] = [
  ['intent', 'add'],
  ['holidayDate', '2026-12-25'],
  ['name', ' Christmas Day '],
];

describe('holidays loader', () => {
  it('loads the year in the URL, both ends included', async () => {
    const api = fakeApi(() => json(page([christmas])));
    const result = await loader(
      args({ context: api.context, request: new Request(`${WEB}/holidays?year=2027`) }),
    );
    const query = new URL(api.requests[0]!.url).searchParams;
    expect([query.get('from'), query.get('to')]).toEqual(['2027-01-01', '2027-12-31']);
    expect(result.year).toBe(2027);
    expect(result.years).toContain(2027);
    expect(result.holidays[0]!.createdAt).toBeInstanceOf(Date);
  });
});

describe('holidays action', () => {
  it('adds a holiday, the name trimmed (AC-27)', async () => {
    const api = fakeApi(() => json(christmas, 201));
    const result = await submit(api, addFields);
    expect(result).toEqual({ ok: true, intent: 'add', holidayDate: '2026-12-25' });
    expect(await api.requests[0]!.json()).toEqual({
      holidayDate: '2026-12-25',
      name: 'Christmas Day',
    });
  });

  it('answers with the weeks to confirm, then resends with confirm (AC-19c, AC-27)', async () => {
    const api = fakeApi(() =>
      apiError('ConfirmationRequired', 'org.capacity_confirmation_required', 'x', 409, {
        overbookedWeeks: [
          {
            employee: { id: olena.id, fullName: olena.fullName, team: null },
            weekStart: '2026-12-21',
            overMinutes: 480,
          },
        ],
      }),
    );
    expect(await submit(api, addFields)).toMatchObject({
      data: {
        ok: false,
        kind: 'confirm',
        weeks: [{ employeeName: 'Olena Kovalenko', weekStart: '2026-12-21', overMinutes: 480 }],
      },
    });

    const confirmed = fakeApi(() => json(christmas, 201));
    await submit(confirmed, [...addFields, ['confirm', 'true']]);
    expect(await confirmed.requests[0]!.json()).toMatchObject({ confirm: true });
  });

  it('shows a date already on the list under the date', async () => {
    const api = fakeApi(() => apiError('Conflict', 'org.duplicate_holiday_date', 'x', 409));
    expect(await submit(api, addFields)).toMatchObject({
      data: {
        kind: 'invalid',
        fieldErrors: { holidayDate: HOLIDAY_MESSAGE.duplicate('2026-12-25') },
      },
    });
  });

  it('checks the date and name before calling the api', async () => {
    const api = fakeApi(() => json({}));
    const result = await submit(api, [
      ['intent', 'add'],
      ['holidayDate', '2026-02-30'],
      ['name', ''],
    ]);
    expect(result).toMatchObject({
      data: { fieldErrors: { holidayDate: HOLIDAY_MESSAGE.date, name: HOLIDAY_MESSAGE.name } },
    });
    expect(api.requests).toHaveLength(0);
  });

  it('removes a holiday', async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    const result = await submit(api, [
      ['intent', 'remove'],
      ['publicHolidayId', christmas.id],
    ]);
    expect(result).toEqual({ ok: true, intent: 'remove' });
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual([
      'DELETE',
      `/org/public-holidays/${christmas.id}`,
    ]);
  });

  it.each([
    ['adding', addFields],
    [
      'removing',
      [
        ['intent', 'remove'],
        ['publicHolidayId', christmas.id],
      ] as [string, string][],
    ],
  ])('refuses %s without manage-holiday-list, naming it (AC-28)', async (_, fields) => {
    const api = fakeApi(() => apiError('Forbidden', 'org.missing_permission', 'x', 403));
    await expect(submit(api, fields)).rejects.toMatchObject({
      data: { reason: 'missing-permission', permission: 'manage holiday list' },
      init: { status: 403 },
    });
  });
});
