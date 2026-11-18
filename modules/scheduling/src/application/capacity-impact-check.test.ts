import { CapacityImpactCheck, type EmployeeTerms } from '@arv/org';
import { Effect, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { Segment } from '../domain/allocation';
import { CapacityImpactCheckLive } from './capacity-impact-check';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

const H = 60;

const week = (startsOn: string, endsOn: string, hours: number) =>
  new Segment({ startsOn, endsOn, rateMinutes: hours * H, ratePeriod: 'week' });

const day = (startsOn: string, endsOn: string, hours: number) =>
  new Segment({ startsOn, endsOn, rateMinutes: hours * H, ratePeriod: 'day' });

let fakes: SchedulingFakes;

/** Calls the port as org would, through scheduling's Layer on the fakes. */
const check = <A>(use: (port: CapacityImpactCheck['Type']) => Effect.Effect<A>) =>
  Effect.runPromise(
    Effect.flatMap(CapacityImpactCheck, use).pipe(
      Effect.provide(CapacityImpactCheckLive.pipe(Layer.provide(fakes.layer))),
    ),
  );

const planner = () => {
  const actor = fakes.user([]);
  return actor._tag === 'User' ? actor.id : (undefined as never);
};

beforeEach(() => {
  fakes = makeSchedulingFakes(); // today is Wednesday 2026-10-28
});

describe('CapacityImpactCheck.termsChange', () => {
  const termsOf = (contractMinutes: number, workingDays: EmployeeTerms['workingDays']) =>
    ({
      contractMinutes,
      workingDays,
      employmentStart: '2025-01-06',
      employmentEnd: null,
    }) satisfies EmployeeTerms;

  it('lists every coming week 24 contract hours would overbook, and writes nothing (AC-19c)', async () => {
    const resource = fakes.seedResource({ contractMinutes: 40 * H });
    const client = fakes.seedProject();
    const by = planner();
    // 32 of 40 hours in four coming weeks; the week of 2026-11-30 is already over at 48 hours.
    const fits = fakes.seedAllocation(
      resource.employeeId,
      client.id,
      [week('2026-11-02', '2026-11-29', 32)],
      by,
    );
    const over = fakes.seedAllocation(
      resource.employeeId,
      fakes.seedProject().id,
      [week('2026-11-30', '2026-12-06', 48)],
      by,
    );
    // A week before this one is never reported, overbooked or not.
    fakes.seedAllocation(
      resource.employeeId,
      client.id,
      [week('2026-10-12', '2026-10-18', 40)],
      by,
    );
    const before = fakes.allocations();

    const weeks = await check((port) =>
      port.termsChange(resource.employeeId, termsOf(24 * H, [1, 2, 3])),
    );

    expect(weeks).toEqual(
      ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map((weekStart) => ({
        employeeId: resource.employeeId,
        weekStart,
        overMinutes: 8 * H,
      })),
    );
    expect(fakes.history()).toEqual([]);
    expect(fakes.allocations()).toEqual(before);
    expect(fakes.allocation(fits.allocation.id)?.allocation.version).toBe(1);
    expect(fakes.allocation(over.allocation.id)?.allocation.version).toBe(1);
  });

  it('lists nothing when the new terms keep every week within capacity', async () => {
    const resource = fakes.seedResource({ contractMinutes: 40 * H });
    fakes.seedAllocation(
      resource.employeeId,
      fakes.seedProject().id,
      [week('2026-11-02', '2026-11-29', 32)],
      planner(),
    );

    const more = await check((port) =>
      port.termsChange(resource.employeeId, termsOf(36 * H, [1, 2, 3, 4, 5])),
    );
    const none = await check((port) =>
      port.termsChange(fakes.seedResource().employeeId, termsOf(8 * H, [1])),
    );

    expect(more).toEqual([]);
    expect(none).toEqual([]);
  });

  it('lists nothing for terms that leave the record incomplete (AC-06)', async () => {
    const resource = fakes.seedResource({ contractMinutes: 40 * H });
    fakes.seedAllocation(
      resource.employeeId,
      fakes.seedProject().id,
      [week('2026-11-02', '2026-11-08', 32)],
      planner(),
    );

    const weeks = await check((port) =>
      port.termsChange(resource.employeeId, {
        contractMinutes: null,
        workingDays: [1, 2, 3, 4, 5],
        employmentStart: '2025-01-06',
        employmentEnd: null,
      }),
    );

    expect(weeks).toEqual([]);
  });
});

describe('CapacityImpactCheck.holidayAdded', () => {
  it('a Monday holiday overbooks only the full-timer, and writes nothing (AC-27, AC-19c)', async () => {
    const fullTimer = fakes.seedResource({
      fullName: 'Full Timer',
      contractMinutes: 40 * H,
      workingDays: [1, 2, 3, 4, 5],
    });
    const partTimer = fakes.seedResource({
      fullName: 'Part Timer',
      contractMinutes: 24 * H,
      workingDays: [3, 4, 5],
    });
    const client = fakes.seedProject();
    const by = planner();
    // Tuesday to Friday at 10 hours: 40 of 40 hours; with the Monday off, 40 of 32.
    fakes.seedAllocation(
      fullTimer.employeeId,
      client.id,
      [day('2026-11-10', '2026-11-13', 10)],
      by,
    );
    // Wednesday to Friday at 8 hours: the part-timer's whole week, which a Monday doesn't touch.
    fakes.seedAllocation(partTimer.employeeId, client.id, [day('2026-11-11', '2026-11-13', 8)], by);
    const before = fakes.allocations();

    const weeks = await check((port) => port.holidayAdded('2026-11-09'));

    expect(weeks).toEqual([
      { employeeId: fullTimer.employeeId, weekStart: '2026-11-09', overMinutes: 8 * H },
    ]);
    expect(fakes.history()).toEqual([]);
    expect(fakes.allocations()).toEqual(before);
  });

  it('lists nothing when hours on the holiday drop with the capacity', async () => {
    const resource = fakes.seedResource({ contractMinutes: 40 * H });
    // 36 of 40 hours spread over the week: the Monday takes 7.2 of both, leaving 28.8 of 32.
    fakes.seedAllocation(
      resource.employeeId,
      fakes.seedProject().id,
      [week('2026-11-09', '2026-11-15', 36)],
      planner(),
    );

    expect(await check((port) => port.holidayAdded('2026-11-09'))).toEqual([]);
  });

  it('lists nothing for a holiday before this week', async () => {
    const resource = fakes.seedResource({ contractMinutes: 40 * H });
    fakes.seedAllocation(
      resource.employeeId,
      fakes.seedProject().id,
      [day('2026-10-13', '2026-10-16', 10)],
      planner(),
    );

    expect(await check((port) => port.holidayAdded('2026-10-12'))).toEqual([]);
  });
});
