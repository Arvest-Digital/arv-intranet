import { describe, expect, it } from 'vitest';
import {
  divideTicksExactly,
  hoursToTicks,
  minutesToTicks,
  sumTicks,
  TICKS_PER_HOUR,
  type Ticks,
  ticksToDisplayHours,
} from './ticks';

describe('ticks', () => {
  it('is 1/420 of a minute', () => {
    expect(minutesToTicks(1)).toBe(420);
    expect(TICKS_PER_HOUR).toBe(25_200);
    expect(hoursToTicks(7.5)).toBe(minutesToTicks(450));
  });

  it('splits 40 h over 3 days exactly (13⅓ h a day)', () => {
    const share = divideTicksExactly(hoursToTicks(40), 3);
    expect(sumTicks([share, share, share])).toBe(hoursToTicks(40));
  });

  it.each([1, 2, 3, 4, 5, 6, 7])('splits any whole-minute amount over %i days exactly', (days) => {
    for (let minutes = 1; minutes <= 3600; minutes++) {
      const share = divideTicksExactly(minutesToTicks(minutes), days);
      expect(share * days).toBe(minutesToTicks(minutes));
    }
  });

  it('treats a remainder as a defect', () => {
    expect(() => divideTicksExactly(10 as Ticks, 3)).toThrow(RangeError);
    expect(() => divideTicksExactly(hoursToTicks(8), 0)).toThrow(RangeError);
  });
});

describe('display hours (nearest half hour)', () => {
  it.each([
    { minutes: 0, shown: 0 },
    { minutes: 800, shown: 13.5 }, // 13⅓ h
    { minutes: 14, shown: 0 },
    { minutes: 15, shown: 0.5 }, // a quarter hour rounds half away from zero
    { minutes: 44, shown: 0.5 },
    { minutes: 45, shown: 1 },
    { minutes: 2400, shown: 40 },
    { minutes: -15, shown: -0.5 },
    { minutes: -480, shown: -8 },
  ])('$minutes min → $shown h', ({ minutes, shown }) => {
    expect(ticksToDisplayHours(minutesToTicks(minutes))).toBe(shown);
  });

  it('rounds an exact third without drift', () => {
    expect(ticksToDisplayHours(divideTicksExactly(hoursToTicks(40), 3))).toBe(13.5);
    expect(ticksToDisplayHours(divideTicksExactly(hoursToTicks(20), 3))).toBe(6.5); // 6⅔ h
  });
});
