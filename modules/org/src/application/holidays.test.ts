import { Actor, CurrentActor, PermissionDenied, Today, Unauthenticated } from '@arv/kernel';
import { Effect, Either, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CapacityConfirmationRequired,
  DuplicateHolidayDate,
  type OverbookedWeek,
  PublicHolidayNotFound,
} from '../domain/errors';
import { HolidayName, PublicHolidayId } from '../domain/public-holiday';
import { MANAGE_EMPLOYEE_RECORDS, MANAGE_HOLIDAY_LIST } from '../permissions';
import { addPublicHoliday, listPublicHolidays, removePublicHoliday } from './holidays';
import { makeOrgFakes, type OrgFakes } from './testing';

const holidayName = Schema.decodeSync(HolidayName);
const unknownId = '01a135e4-c4d9-797e-ad76-ae23c85d58cd';

const setup = () => {
  const fakes = makeOrgFakes();
  const actor = Actor.User({ id: fakes.seedLogin(), permissions: new Set([MANAGE_HOLIDAY_LIST]) });
  return { fakes, actor };
};

type OrgServices = CurrentActor | Layer.Layer.Success<OrgFakes['layer']>;
type Probe = (
  id: PublicHolidayId,
) => Effect.Effect<unknown, { readonly _tag: string }, OrgServices>;

const run = <A, E>(fakes: OrgFakes, actor: Actor, effect: Effect.Effect<A, E, OrgServices>) =>
  Effect.runPromise(
    Effect.either(effect).pipe(
      Effect.provideService(CurrentActor, actor),
      Effect.provide(fakes.layer),
    ),
  );

/** A Monday holiday (AC-27). */
const monday = { holidayDate: '2026-12-07', name: holidayName('Company day') } as const;

/** The full-timer's week that the Monday would overbook, as scheduling would report it. */
const overbooked: ReadonlyArray<OverbookedWeek> = [
  { employeeId: unknownId, weekStart: '2026-12-07', overMinutes: 240 },
];

describe('public holidays (AC-27, AC-28)', () => {
  it('adds a holiday that overbooks nothing, after asking the capacity check', async () => {
    const { fakes, actor } = setup();
    const result = await run(fakes, actor, addPublicHoliday(monday));
    expect(Either.getOrThrow(result)).toMatchObject({
      holidayDate: '2026-12-07',
      name: 'Company day',
    });
    expect(fakes.impact.holidayDates).toEqual(['2026-12-07']);
  });

  it('asks to confirm when the holiday would overbook a week, then saves on confirm (AC-19c)', async () => {
    const { fakes, actor } = setup();
    fakes.impact.weeks = overbooked;

    const warned = await run(fakes, actor, addPublicHoliday(monday));
    expect(warned).toEqual(
      Either.left(new CapacityConfirmationRequired({ overbookedWeeks: [overbooked[0]!] })),
    );
    expect(fakes.listsSnapshot().holidays).toEqual([]);

    // The client re-sends the same request with confirm; the warning is not recomputed.
    const callsBefore = fakes.impact.calls;
    const saved = await run(fakes, actor, addPublicHoliday({ ...monday, confirm: true }));
    expect(Either.getOrThrow(saved).holidayDate).toBe('2026-12-07');
    expect(fakes.impact.calls).toBe(callsBefore);
    expect(fakes.listsSnapshot().holidays).toHaveLength(1);
  });

  it('refuses a date already on the list before any warning', async () => {
    const { fakes, actor } = setup();
    fakes.seedHoliday('2026-12-07', 'Already there');
    fakes.impact.weeks = overbooked;

    const result = await run(fakes, actor, addPublicHoliday(monday));
    expect(result).toEqual(Either.left(new DuplicateHolidayDate({ holidayDate: '2026-12-07' })));
    expect(fakes.impact.calls).toBe(0);
  });

  it('removes a holiday without a warning, and reports one that is gone', async () => {
    const { fakes, actor } = setup();
    const holiday = fakes.seedHoliday('2026-12-07', 'Company day');
    fakes.impact.weeks = overbooked;

    expect(Either.isRight(await run(fakes, actor, removePublicHoliday(holiday.id)))).toBe(true);
    expect(fakes.listsSnapshot().holidays).toEqual([]);
    expect(fakes.impact.calls).toBe(0);

    expect(await run(fakes, actor, removePublicHoliday(holiday.id))).toEqual(
      Either.left(new PublicHolidayNotFound({ id: holiday.id })),
    );
  });

  describe('without org:manage-holiday-list (AC-28)', () => {
    const probes: ReadonlyArray<readonly [string, Probe]> = [
      ['addPublicHoliday', () => addPublicHoliday({ ...monday, confirm: true })],
      ['removePublicHoliday', (id: PublicHolidayId) => removePublicHoliday(id)],
    ];

    it.each(probes)('%s is refused and the list stays unchanged', async (_, make) => {
      const { fakes } = setup();
      const holiday = fakes.seedHoliday('2026-12-25', 'Christmas Day');
      const before = fakes.listsSnapshot();
      // Managing employee records does not include the holiday list.
      const actor = Actor.User({
        id: fakes.seedLogin(),
        permissions: new Set([MANAGE_EMPLOYEE_RECORDS]),
      });

      const result = await run(fakes, actor, make(holiday.id));
      expect(result).toEqual(
        Either.left(new PermissionDenied({ permission: MANAGE_HOLIDAY_LIST })),
      );
      expect(fakes.listsSnapshot()).toEqual(before);
      expect(fakes.impact.calls).toBe(0);
    });

    it.each(probes)('%s answers Unauthenticated for an anonymous caller', async (_, make) => {
      const { fakes } = setup();
      const result = await run(fakes, Actor.Anonymous(), make(PublicHolidayId.make(unknownId)));
      expect(result).toEqual(Either.left(new Unauthenticated({})));
    });
  });

  describe('listing (US-09, api-sync-report D-5)', () => {
    /** Today is 16 November 2026 in the company zone. */
    const today = Layer.succeed(Today, { date: Effect.succeed('2026-11-16') });
    const list = (fakes: OrgFakes, actor: Actor, query = {}) =>
      run(fakes, actor, listPublicHolidays(query).pipe(Effect.provide(today)));

    const seedYear = (fakes: OrgFakes) => {
      // Added out of date order, so id order is not date order.
      fakes.seedHoliday('2026-12-25', 'Christmas Day');
      fakes.seedHoliday('2026-01-01', 'New Year');
      fakes.seedHoliday('2027-01-01', 'Next New Year');
      fakes.seedHoliday('2026-05-01', 'Labour Day');
    };

    it('lists the current year by date for any signed-in user', async () => {
      const { fakes } = setup();
      seedYear(fakes);
      const reader = Actor.User({ id: fakes.seedLogin(), permissions: new Set() });

      const page = Either.getOrThrow(await list(fakes, reader));
      expect(page.items.map((h) => h.holidayDate)).toEqual([
        '2026-01-01',
        '2026-05-01',
        '2026-12-25',
      ]);
      expect(page).toMatchObject({ hasNext: false, hasPrev: false, nextCursor: null });
    });

    it('takes a range and pages it by date', async () => {
      const { fakes, actor } = setup();
      seedYear(fakes);
      const range = { from: '2026-05-01', to: '2027-12-31' };

      const first = Either.getOrThrow(await list(fakes, actor, { ...range, limit: 2 }));
      expect(first.items.map((h) => h.holidayDate)).toEqual(['2026-05-01', '2026-12-25']);
      expect(first.hasNext).toBe(true);
      const after = first.nextCursor as string;
      const second = Either.getOrThrow(await list(fakes, actor, { ...range, after, limit: 2 }));
      expect(second.items.map((h) => h.holidayDate)).toEqual(['2027-01-01']);
      expect(second).toMatchObject({ hasNext: false, hasPrev: true });
    });

    it('answers Unauthenticated for an anonymous caller', async () => {
      const { fakes } = setup();
      expect(await list(fakes, Actor.Anonymous())).toEqual(Either.left(new Unauthenticated({})));
    });
  });
});
