import { describe, expect, it } from 'vitest';
import { entryView, segmentText } from './history';
import { atlasHistory, redactedLeaveHistory, visibleLeaveHistory } from './test-data';

const [imported, trimmed, changed] = atlasHistory.map(entryView);

describe('history entries (AC-16)', () => {
  it('names the importer and what the import created', () => {
    expect(imported).toMatchObject({
      label: 'Imported',
      who: 'Andrii Melnyk',
      when: '28 Sep 2026, 16:40',
      note: 'Imported by Andrii in the one-time import',
      // An import has no effective day of its own: it applies from the allocation's start.
      effectiveFrom: '2026-10-01',
      before: [{ text: '—', tone: 'same' }],
      after: [{ text: '1 Oct–31 Dec · 20h/wk', tone: 'new' }],
    });
  });

  it('names the project and who closed it for a trim', () => {
    expect(trimmed).toMatchObject({
      label: 'Trimmed',
      note: 'Trimmed when Atlas CRM was closed by Andrii',
      effectiveFrom: '2026-12-01',
      before: [{ text: '1 Oct–31 Dec · 20h/wk', tone: 'gone' }],
      after: [{ text: '1 Oct–30 Nov · 20h/wk', tone: 'new' }],
    });
  });

  it('keeps the weeks before a change as they were', () => {
    expect(changed).toMatchObject({
      label: 'Changed',
      who: 'Marko Ivanov',
      note: null,
      effectiveFrom: '2026-11-18',
      before: [{ text: '1 Oct–30 Nov · 20h/wk', tone: 'gone' }],
      after: [
        { text: '1 Oct–17 Nov · 20h/wk', tone: 'same' },
        { text: '18 Nov–30 Nov · 10h/wk', tone: 'new' },
      ],
    });
  });

  it('shows leave as «Away» when its type is hidden, as full days otherwise (AC-29)', () => {
    expect(redactedLeaveHistory.map(entryView)[1]?.after).toEqual([
      { text: '12 Nov–13 Nov · Away', tone: 'new' },
    ]);
    expect(visibleLeaveHistory.map(entryView)[1]?.after).toEqual([
      { text: '12 Nov–13 Nov · Full days', tone: 'new' },
    ]);
  });

  it('shows a day rate and quarter hours', () => {
    const day = { startsOn: '2026-11-02', endsOn: '2026-11-06' };
    expect(segmentText({ ...day, rateMinutes: 480, ratePeriod: 'day' }, false)).toBe(
      '2 Nov–6 Nov · 8h/day',
    );
    expect(segmentText({ ...day, rateMinutes: 435, ratePeriod: 'day' }, false)).toBe(
      '2 Nov–6 Nov · 7.25h/day',
    );
  });
});
