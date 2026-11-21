import { Clock, Context, Effect, Layer } from 'effect';

/**
 * Today's business date, `YYYY-MM-DD`, in the company time zone (sad §8 Dates and time zone).
 * Read through Effect's `Clock`, so a test fixes it with `TestClock` or its own `Clock`.
 */
export class Today extends Context.Tag('@arv/kernel/Today')<
  Today,
  { readonly date: Effect.Effect<string> }
>() {}

const dateFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

/** The `YYYY-MM-DD` calendar date of `epochMillis` in `timeZone` (an IANA name). */
export const calendarDateIn = (timeZone: string) => {
  const format = dateFormat(timeZone);
  return (epochMillis: number): string => {
    const parts = format.formatToParts(epochMillis);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
};

/**
 * `Today` for `timeZone` (the api's `COMPANY_TIME_ZONE`). An unknown zone is a defect when the
 * Layer is built, never a date in the wrong zone.
 */
export const TodayLive = (timeZone: string): Layer.Layer<Today> =>
  Layer.sync(Today, () => {
    const toDate = calendarDateIn(timeZone); // RangeError for an unknown zone
    return { date: Effect.map(Clock.currentTimeMillis, toDate) };
  });
