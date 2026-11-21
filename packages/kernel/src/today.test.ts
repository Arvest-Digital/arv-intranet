import { Effect, Exit, TestClock, TestContext } from 'effect';
import { describe, expect, it } from 'vitest';
import { calendarDateIn, Today, TodayLive } from './today';

const todayAt = (iso: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(iso));
    return yield* Effect.flatMap(Today, (today) => today.date);
  }).pipe(
    Effect.provide(TodayLive('Europe/Kyiv')),
    Effect.provide(TestContext.TestContext),
    Effect.runPromise,
  );

describe('Today', () => {
  it('is the Kyiv date just after midnight Kyiv, while UTC is still on the previous day', async () => {
    // 00:05 on 15 Nov in Kyiv (UTC+2) is 22:05 on 14 Nov in UTC.
    expect(await todayAt('2026-11-14T22:05:00Z')).toBe('2026-11-15');
  });

  it('is still the previous day just before midnight Kyiv', async () => {
    expect(await todayAt('2026-11-14T21:55:00Z')).toBe('2026-11-14');
  });

  it('follows summer time (UTC+3)', async () => {
    // 00:30 on 1 Jul in Kyiv is 21:30 on 30 Jun in UTC.
    expect(await todayAt('2026-06-30T21:30:00Z')).toBe('2026-07-01');
  });

  it('fails to build for an unknown time zone', async () => {
    const exit = Effect.runSyncExit(Effect.provide(Today, TodayLive('Not/AZone')));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('calendarDateIn', () => {
  it('pads month and day', async () => {
    expect(calendarDateIn('UTC')(Date.parse('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });
});
