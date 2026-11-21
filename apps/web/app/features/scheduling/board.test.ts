import { describe, expect, it } from 'vitest';
import {
  boardHref,
  cellView,
  groupByProject,
  groupByTeam,
  isoWeek,
  parseBoardParams,
  windowLabel,
  windowNav,
} from './board';
import {
  ATLAS,
  allocation,
  board,
  COBALT,
  cell,
  everyStateBoard,
  row,
  SICK,
  W47,
  W48,
} from './test-data';

const params = (query: string) => parseBoardParams(new URLSearchParams(query));

describe('board params', () => {
  it('reads the window, filters and view from the URL', () => {
    expect(
      params(
        'from=2026-11-18&weeks=4&team=01933b8e-0000-7000-8000-000000000101&project=01933b8e-0000-7000-8000-000000000501&view=project',
      ),
    ).toEqual({
      from: '2026-11-16',
      weeks: 4,
      team: '01933b8e-0000-7000-8000-000000000101',
      project: '01933b8e-0000-7000-8000-000000000501',
      view: 'project',
      free: null,
    });
  });

  it('drops values that cannot be right and falls back to the default window', () => {
    expect(params('from=2026-02-30&weeks=13&team=nope&view=grid')).toEqual({
      from: null,
      weeks: 12,
      team: null,
      project: null,
      view: 'people',
      free: null,
    });
  });

  it('keeps defaults out of the URL', () => {
    const p = params('');
    expect(boardHref(p)).toBe('?');
    expect(boardHref(p, { weeks: 1, view: 'project' })).toBe('?weeks=1&view=project');
    expect(
      boardHref(params('weeks=4&team=01933b8e-0000-7000-8000-000000000101'), { team: null }),
    ).toBe('?weeks=4');
  });
});

describe('week window', () => {
  it('numbers ISO weeks and labels the window', () => {
    expect(isoWeek(W47)).toBe(47);
    expect(isoWeek('2027-01-04')).toBe(1);
    expect(windowLabel([W47, W48])).toBe('W47 2026 – W48 2026');
    expect(windowLabel([W47])).toBe('W47 · 16–22 Nov 2026');
  });

  it('moves a week at a time, inside 12 months back and 52 weeks ahead (AC-01)', () => {
    const today = '2026-11-19';
    expect(windowNav(today, W47, 12)).toEqual({ prev: '2026-11-09', next: W48, today: null });
    // 12 months back from Thursday 19 Nov 2026 is Wednesday 19 Nov 2025: its week starts 17 Nov.
    expect(windowNav(today, '2025-11-17', 12).prev).toBeNull();
    // The last 12-week window starts 52 − 12 + 1 weeks after the current week.
    expect(windowNav(today, '2027-08-30', 12).next).toBeNull();
    expect(windowNav(today, '2027-08-23', 12).next).toBe('2027-08-30');
    expect(windowNav(today, W48, 12).today).toBe(W47);
  });
});

describe('cell view', () => {
  it('gives every state a text label and «allocated/capacity» (AC-01, AC-06, QS-7)', () => {
    const views = [
      cellView(cell(W47, 'free', 0, 40)),
      cellView(cell(W47, 'partly-booked', 24, 40)),
      cellView(cell(W47, 'partly-booked', 40, 40)),
      cellView(cell(W47, 'overbooked', 48, 40)),
      cellView(cell(W47, 'non-working', 0, 0)),
      cellView(cell(W47, 'incomplete-record', 0, null)),
      cellView(cell(W47, 'needs-attention', 16, 0)),
    ];
    expect(views.map((v) => [v.label, v.figure, v.note])).toEqual([
      ['Free', '0/40', null],
      ['Partly booked', '24/40', null],
      ['Fully booked', '40/40', null],
      ['Overbooked', '48/40', '+8h over'],
      ['Non-working', '—', null],
      ['Incomplete record', '?', 'Capacity unknown'],
      ['Needs attention', '16/0', 'Past end date'],
    ]);
  });

  it('shows «away» with the leave days next to the hours (AC-01)', () => {
    const view = cellView(cell(W47, 'partly-booked', 16, 40, 2));
    expect(view.away).toBe('Away · 2d');
    expect(view.description).toBe('Partly booked · 16h of 40h · away 2 days');
  });

  it('shows hours to one decimal from exact minutes', () => {
    expect(cellView({ ...cell(W47, 'partly-booked', 0, 40), allocatedMinutes: 450 }).figure).toBe(
      '7.5/40',
    );
  });
});

describe('group by team', () => {
  it('groups by team, «No team» last, with weekly totals and overbooked counts', () => {
    const groups = groupByTeam(everyStateBoard());
    expect(groups.map((g) => [g.name, g.rows.length])).toEqual([
      ['Delivery', 3],
      ['No team', 1],
    ]);
    expect(groups[0]?.totals.map((t) => [t.figure, t.over])).toEqual([
      ['64/80', 1],
      ['80/120', 0],
    ]);
  });
});

describe('group by project (AC-02b)', () => {
  it('totals each project per week and puts each resource beside their whole-week state', () => {
    const groups = groupByProject(everyStateBoard());
    const atlas = groups.find((g) => g.key === ATLAS.id);
    expect(atlas?.totals).toEqual(['40h', '48h']);
    expect(atlas?.rows.map((r) => r.row.employee.fullName)).toEqual([
      'Andrii Shevchenko',
      'Olena Kovalenko',
      'Taras Melnyk',
    ]);
    const taras = atlas?.rows.find((r) => r.row.employee.fullName === 'Taras Melnyk');
    expect(taras?.cells.map((c) => [c.hours, c.week.label, c.week.figure])).toEqual([
      ['24h', 'Overbooked', '48/40'],
      ['24h', 'Fully booked', '40/40'],
    ]);
  });

  it('puts all leave the viewer may not name into one «Away» group, after the projects (AC-29)', () => {
    const b = board([
      row(
        1,
        'Olena Kovalenko',
        [cell(W47, 'partly-booked', 8, 40, 1), cell(W48, 'free', 0, 40)],
        [allocation(null, [[W47, 8]], true)],
      ),
      row(
        2,
        'Taras Melnyk',
        [cell(W47, 'partly-booked', 40, 40, 3), cell(W48, 'free', 0, 40)],
        [allocation(COBALT, [[W47, 16]]), allocation(null, [[W47, 24]], true)],
      ),
    ]);
    const groups = groupByProject(b);
    expect(groups.map((g) => g.name)).toEqual(['Cobalt billing', 'Away']);
    const away = groups[1];
    expect(away?.type).toBeNull();
    expect(away?.rows.map((r) => r.cells[0]?.away)).toEqual(['Away · 1d', 'Away · 3d']);
    // Leave is not work: the group shows days away, not hours.
    expect(away?.totals).toEqual(['4d away', '']);
  });

  it('names leave projects for viewers who may see the leave type', () => {
    const b = board([
      row(
        1,
        'Olena Kovalenko',
        [cell(W47, 'partly-booked', 8, 40, 1), cell(W48, 'free', 0, 40)],
        [allocation(SICK, [[W47, 8]], true), allocation(ATLAS, [[W48, 8]])],
      ),
    ]);
    expect(groupByProject(b).map((g) => [g.name, g.leave])).toEqual([
      ['Atlas CRM', false],
      ['Sick leave', true],
    ]);
  });
});
