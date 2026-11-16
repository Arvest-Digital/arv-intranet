import { Actor, CurrentActor, PermissionDenied, Unauthenticated } from '@arv/kernel';
import { Effect, Either, type Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CapacityConfirmationRequired,
  DuplicateHolidayDate,
  type OverbookedWeek,
  PublicHolidayNotFound,
} from '../domain/errors';
import { HolidayName, PublicHolidayId } from '../domain/public-holiday';
import { MANAGE_EMPLOYEE_RECORDS, MANAGE_HOLIDAY_LIST } from '../permissions';
import { addPublicHoliday, removePublicHoliday } from './holidays';
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
});
