import { describe, expect, it } from 'vitest';
import { historyCutOff } from './purge-history';

describe('historyCutOff', () => {
  it('is the start of the same day 12 months earlier, in UTC', () => {
    expect(historyCutOff('2026-03-01')).toEqual(new Date('2025-03-01T00:00:00Z'));
  });

  it('falls back to the month end when that day does not exist', () => {
    expect(historyCutOff('2028-02-29')).toEqual(new Date('2027-02-28T00:00:00Z'));
  });
});
