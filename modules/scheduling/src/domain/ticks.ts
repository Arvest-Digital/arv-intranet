import { Schema } from 'effect';

/**
 * Hour arithmetic (ADR-0009). Hours are stored as integer minutes and computed in integer ticks of
 * 1/420 minute: 420 is the least common multiple of 1…7, so a weekly amount spread over any
 * working-day count is an exact integer. Ticks never leave the domain unrounded except through
 * `ticksToDisplayHours`, which is for presenters only.
 */
export const TICKS_PER_MINUTE = 420;
export const MINUTES_PER_HOUR = 60;
export const TICKS_PER_HOUR = TICKS_PER_MINUTE * MINUTES_PER_HOUR;

/** A stored amount: whole minutes (contract minutes, allocation rate minutes). */
export const Minutes = Schema.Int.pipe(Schema.brand('Minutes'));
export type Minutes = typeof Minutes.Type;

/** A computed amount: whole ticks of 1/420 minute. Never mix with minutes or plain numbers. */
export const Ticks = Schema.Int.pipe(Schema.brand('Ticks'));
export type Ticks = typeof Ticks.Type;

export const ZERO_TICKS = 0 as Ticks;

export const minutesToTicks = (minutes: number): Ticks => (minutes * TICKS_PER_MINUTE) as Ticks;

/** Test and fixture helper: whole or fractional hours (e.g. 7.5) to ticks. */
export const hoursToTicks = (hours: number): Ticks =>
  minutesToTicks(Math.round(hours * MINUTES_PER_HOUR));

export const addTicks = (a: Ticks, b: Ticks): Ticks => (a + b) as Ticks;

export const subtractTicks = (a: Ticks, b: Ticks): Ticks => (a - b) as Ticks;

export const sumTicks = (values: Iterable<Ticks>): Ticks => {
  let total = 0;
  for (const value of values) total += value;
  return total as Ticks;
};

/**
 * `ticks ÷ parts` for an exact share, such as a weekly amount over 1–7 working days. A remainder
 * means the caller broke ADR-0009 (a divisor outside 1–7 or ticks not built from minutes): a defect.
 */
export const divideTicksExactly = (ticks: Ticks, parts: number): Ticks => {
  if (!Number.isInteger(parts) || parts <= 0 || ticks % parts !== 0) {
    throw new RangeError(`${ticks} ticks do not split exactly into ${parts} parts`);
  }
  return (ticks / parts) as Ticks;
};

const TICKS_PER_HALF_HOUR = TICKS_PER_HOUR / 2;

/**
 * Hours rounded to the nearest half hour, halves away from zero (PRD §6: shown rounded, never
 * computed rounded). Only presenters call this; comparisons stay on exact ticks.
 */
export const ticksToDisplayHours = (ticks: Ticks): number => {
  const sign = ticks < 0 ? -1 : 1;
  const magnitude = Math.abs(ticks);
  const halfHours = Math.floor((magnitude + TICKS_PER_HALF_HOUR / 2) / TICKS_PER_HALF_HOUR);
  return (sign * halfHours) / 2 || 0;
};
