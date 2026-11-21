import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { CalendarDate, normaliseWorkingDays } from './calendar';
import { HolidayName, PublicHoliday, PublicHolidayId } from './public-holiday';

describe('CalendarDate', () => {
  const isDate = Schema.is(CalendarDate);

  it.each(['2026-12-25', '2028-02-29'])('accepts %s', (value) => {
    expect(isDate(value)).toBe(true);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-1-5', '2026-12-25T00:00:00Z', ''])(
    'refuses %j',
    (value) => {
      expect(isDate(value)).toBe(false);
    },
  );
});

describe('normaliseWorkingDays', () => {
  it('sorts and removes repeats', () => {
    expect(normaliseWorkingDays([5, 3, 5, 1])).toEqual([1, 3, 5]);
  });
});

describe('PublicHoliday', () => {
  it('holds a holiday on a real date', () => {
    const holiday = new PublicHoliday({
      id: PublicHolidayId.make('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'),
      holidayDate: '2026-12-25',
      name: 'Christmas Day',
      createdAt: new Date('2026-11-01T10:00:00Z'),
    });
    expect(holiday.holidayDate).toBe('2026-12-25');
  });

  it('refuses an impossible date', () => {
    expect(
      () =>
        new PublicHoliday({
          id: PublicHolidayId.make('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'),
          holidayDate: '2026-02-30',
          name: 'Nope',
          createdAt: new Date(),
        }),
    ).toThrow();
  });
});

describe('HolidayName', () => {
  const decode = Schema.decodeUnknownEither(HolidayName);

  it('trims and refuses blank names', () => {
    expect(decode(' Christmas Day ')).toEqual(Either.right('Christmas Day'));
    expect(Either.isLeft(decode('  '))).toBe(true);
  });
});
