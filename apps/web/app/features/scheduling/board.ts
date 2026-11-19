import type { ProjectStatus, ProjectType } from '@arv/contracts/projects';
import type { Board, BoardAllocation, BoardCell, BoardRow } from '@arv/contracts/scheduling';

/** Sees every resource's schedule (AC-01). */
export const VIEW_WHOLE_BOARD = 'scheduling:view-whole-board';
/** Changes allocations; also opens the board (AC-03). */
export const EDIT_ALLOCATIONS = 'scheduling:edit-allocations';
/** Sees leave types instead of «away» (AC-29). */
export const SEE_LEAVE_REASONS = 'scheduling:see-leave-reasons';
/** Sees employment ends and needing-attention marks (AC-22). */
export const MANAGE_EMPLOYEE_RECORDS = 'org:manage-employee-records';

/** The window size, 1 to 12 weeks (OpenAPI `WindowWeeks`); the board opens on 12. */
export const MAX_WEEKS = 12;
/** The zoom presets: they only set `weeks` (PRD §8 may add «Days» later). */
export const ZOOMS: ReadonlyArray<readonly [number, string]> = [
  [1, '1 week'],
  [4, '4 weeks'],
  [12, '12 weeks'],
];
/** How far back (months) and ahead (weeks from the current week) the window may go (AC-01). */
export const MONTHS_BACK = 12;
export const WEEKS_AHEAD = 52;

export type BoardView = 'people' | 'project';

/** The board's state, all of it in the URL (ADR-0002). */
export type BoardParams = {
  /** The first week's Monday, or none for the current week. */
  readonly from: string | null;
  readonly weeks: number;
  readonly team: string | null;
  readonly project: string | null;
  readonly view: BoardView;
};

/** A team or project the filters offer. */
export type FilterOption = {
  readonly id: string;
  readonly name: string;
  readonly type?: ProjectType;
  readonly status?: ProjectStatus;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A real calendar date `YYYY-MM-DD`. */
export const isIsoDate = (value: string) =>
  ISO_DATE.test(value) && toIso(Date.parse(`${value}T00:00:00Z`)) === value;

/**
 * Reads the board's search params. A value that can't be right (a malformed date, a weeks count
 * outside 1–12, a filter that is not an id) is dropped, so the board falls back to its default.
 */
export function parseBoardParams(search: URLSearchParams): BoardParams {
  const from = search.get('from') ?? '';
  const weeks = Number(search.get('weeks'));
  const team = search.get('team') ?? '';
  const project = search.get('project') ?? '';
  return {
    from: isIsoDate(from) ? mondayOf(from) : null,
    weeks: Number.isInteger(weeks) && weeks >= 1 && weeks <= MAX_WEEKS ? weeks : MAX_WEEKS,
    team: UUID.test(team) ? team : null,
    project: UUID.test(project) ? project : null,
    view: search.get('view') === 'project' ? 'project' : 'people',
  };
}

/** The board's URL for `params` with `patch` applied; defaults stay out of the URL. */
export function boardHref(params: BoardParams, patch: Partial<BoardParams> = {}): string {
  const next = { ...params, ...patch };
  const search = new URLSearchParams();
  if (next.from) search.set('from', next.from);
  if (next.weeks !== MAX_WEEKS) search.set('weeks', String(next.weeks));
  if (next.team) search.set('team', next.team);
  if (next.project) search.set('project', next.project);
  if (next.view !== 'people') search.set('view', next.view);
  const query = search.toString();
  return query ? `?${query}` : '?';
}

// ---------- dates (ISO strings, UTC arithmetic) ----------

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10);

export const addDays = (iso: string, days: number) => toIso(toTime(iso) + days * DAY);

/** The Monday of `iso`'s week (ISO weeks start on Monday). */
export function mondayOf(iso: string): string {
  const dow = (new Date(toTime(iso)).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

/** The ISO week number. */
export function isoWeek(iso: string): number {
  const thursday = addDays(mondayOf(iso), 3);
  const yearStart = Date.UTC(Number(thursday.slice(0, 4)), 0, 1);
  return Math.floor((toTime(thursday) - yearStart) / DAY / 7) + 1;
}

/** «16 Nov». */
export const dayMonth = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** «16–22 Nov», or «30 Nov – 6 Dec» across a month. */
export function weekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  return monday.slice(5, 7) === sunday.slice(5, 7)
    ? `${Number(monday.slice(8, 10))}–${dayMonth(sunday)}`
    : `${dayMonth(monday)} – ${dayMonth(sunday)}`;
}

/** «W47 2026». */
export const weekName = (monday: string) => `W${isoWeek(monday)} ${addDays(monday, 3).slice(0, 4)}`;

/** The same day `months` months earlier, clamped to the month's last day (as the api counts). */
function monthsBefore(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 - months;
  const d = Number(iso.slice(8, 10));
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIso(Date.UTC(y, m, Math.min(d, last)));
}

/** The first and last Monday a window may start on, so its weeks stay in range (AC-01). */
export function windowLimits(today: string, weeks: number) {
  const current = mondayOf(today);
  return {
    earliest: mondayOf(monthsBefore(today, MONTHS_BACK)),
    latest: addDays(current, 7 * (WEEKS_AHEAD - weeks + 1)),
  };
}

/** Prev / today / next targets: a week at a time, kept inside the limits; null when disabled. */
export function windowNav(today: string, from: string, weeks: number) {
  const { earliest, latest } = windowLimits(today, weeks);
  const current = mondayOf(today);
  const prev = addDays(from, -7);
  const next = addDays(from, 7);
  return {
    prev: prev >= earliest ? prev : null,
    next: next <= latest ? next : null,
    today: from === current ? null : current,
  };
}

/** «W47 2026 – W6 2027», or for one week «W47 · 16–22 Nov 2026». */
export function windowLabel(weeks: ReadonlyArray<string>): string {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  if (!first || !last) return '';
  if (weeks.length === 1) {
    return `W${isoWeek(first)} · ${weekRange(first)} ${addDays(first, 6).slice(0, 4)}`;
  }
  return `${weekName(first)} – ${weekName(last)}`;
}

// ---------- figures ----------

/** Hours for display: minutes are exact (ADR-0009), shown to one decimal, «7.5», «40». */
export function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

export type CellKind =
  | 'free'
  | 'partly-booked'
  | 'fully-booked'
  | 'overbooked'
  | 'non-working'
  | 'incomplete-record'
  | 'needs-attention';

/** The text label of each state: never colour alone (sad §8 Accessibility, QS-7). */
export const STATE_LABEL: Record<CellKind, string> = {
  free: 'Free',
  'partly-booked': 'Partly booked',
  'fully-booked': 'Fully booked',
  overbooked: 'Overbooked',
  'non-working': 'Non-working',
  'incomplete-record': 'Incomplete record',
  'needs-attention': 'Needs attention',
};

/** What one week cell shows: the state, «allocated/capacity» and the notes under it. */
export type CellView = {
  readonly kind: CellKind;
  readonly label: string;
  /** «24/40», «0/40», «—» (non-working) or «?» (capacity unknown). */
  readonly figure: string;
  /** «+8h over», «Capacity unknown», «Past end date». */
  readonly note: string | null;
  /** «Away · 3d». */
  readonly away: string | null;
  /** Booked share of capacity, 0–100, for the thin bar. */
  readonly fill: number;
  /** The whole cell in words, for the accessible name and tooltip. */
  readonly description: string;
};

export function cellView(cell: BoardCell): CellView {
  const allocated = hours(cell.allocatedMinutes);
  const capacity = cell.capacityMinutes === null ? null : hours(cell.capacityMinutes);
  const kind: CellKind =
    cell.state === 'partly-booked' &&
    cell.capacityMinutes !== null &&
    cell.allocatedMinutes >= cell.capacityMinutes
      ? 'fully-booked'
      : cell.state;
  const label = STATE_LABEL[kind];
  const away = cell.leaveDays > 0 ? `Away · ${cell.leaveDays}d` : null;
  let figure = `${allocated}/${capacity ?? '?'}`;
  let note: string | null = null;
  if (kind === 'non-working') figure = '—';
  if (kind === 'incomplete-record') {
    figure = '?';
    note = 'Capacity unknown';
  }
  if (kind === 'overbooked' && cell.capacityMinutes !== null) {
    note = `+${hours(cell.allocatedMinutes - cell.capacityMinutes)}h over`;
  }
  if (kind === 'needs-attention') note = 'Past end date';
  const fill =
    cell.capacityMinutes && cell.capacityMinutes > 0
      ? Math.min(100, Math.round((cell.allocatedMinutes / cell.capacityMinutes) * 100))
      : 0;
  const parts = [
    label,
    kind === 'non-working' || kind === 'incomplete-record' ? null : `${allocated}h of ${capacity}h`,
    note && kind !== 'incomplete-record' ? note : null,
    kind === 'incomplete-record' ? 'capacity unknown' : null,
    cell.leaveDays > 0 ? `away ${cell.leaveDays} ${cell.leaveDays === 1 ? 'day' : 'days'}` : null,
  ];
  return {
    kind,
    label,
    figure,
    note,
    away,
    fill,
    description: parts.filter(Boolean).join(' · '),
  };
}

/** Minutes of one allocation in one week. */
export const minutesIn = (allocation: BoardAllocation, weekStart: string) =>
  allocation.minutesPerWeek.find((w) => w.weekStart === weekStart)?.minutes ?? 0;

/** The name an allocation shows: its project, or «Away» for leave the viewer may not name (AC-29). */
export const allocationName = (allocation: BoardAllocation) => allocation.project?.name ?? 'Away';

// ---------- by people (AC-01) ----------

export const NO_TEAM = 'No team';

/** A team's total in one week: «120/160», and how many people are overbooked. */
export type GroupTotal = { readonly figure: string; readonly over: number; readonly title: string };

export type TeamGroup = {
  readonly name: string;
  readonly rows: ReadonlyArray<BoardRow>;
  readonly totals: ReadonlyArray<GroupTotal>;
};

/** Rows by team, teams by name, «No team» last (AC-06: the team is optional). */
export function groupByTeam(board: Board): ReadonlyArray<TeamGroup> {
  const byTeam = new Map<string, BoardRow[]>();
  for (const row of board.rows) {
    const name = row.employee.team?.name ?? NO_TEAM;
    byTeam.set(name, [...(byTeam.get(name) ?? []), row]);
  }
  return [...byTeam.entries()]
    .sort(([a], [b]) =>
      a === NO_TEAM ? 1 : b === NO_TEAM ? -1 : a.localeCompare(b, 'en', { sensitivity: 'base' }),
    )
    .map(([name, rows]) => ({
      name,
      rows: [...rows].sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName, 'en')),
      totals: board.weeks.map((week, i) => {
        let allocated = 0;
        let capacity = 0;
        let over = 0;
        let unknown = 0;
        for (const row of rows) {
          const cell = row.cells[i];
          if (!cell) continue;
          allocated += cell.allocatedMinutes;
          if (cell.capacityMinutes === null) unknown++;
          else capacity += cell.capacityMinutes;
          if (cell.state === 'overbooked') over++;
        }
        return {
          figure: `${hours(allocated)}/${hours(capacity)}`,
          over,
          title: `${name}, ${weekName(week)}: ${hours(allocated)}h booked of ${hours(capacity)}h${
            unknown ? ` (${unknown} with unknown capacity)` : ''
          }`,
        };
      }),
    }));
}

// ---------- by project (AC-02b) ----------

const TYPE_ORDER: ReadonlyArray<ProjectType> = ['client', 'internal', 'bench', 'training', 'leave'];

export const TYPE_LABEL: Record<ProjectType, string> = {
  client: 'Client',
  internal: 'Internal',
  bench: 'Bench',
  training: 'Training',
  leave: 'Leave',
};

/** One resource's week in a project group: hours on the project beside the whole-week state. */
export type ProjectCell = {
  /** Hours on this project, or null when none this week. */
  readonly hours: string | null;
  /** For leave groups: «Away · 2d» (or hours when the days can't be told apart). */
  readonly away: string | null;
  readonly week: CellView;
};

export type ProjectGroupRow = {
  readonly row: BoardRow;
  readonly cells: ReadonlyArray<ProjectCell>;
};

export type ProjectGroup = {
  /** A project id, or «away» for the one group of leave the viewer may not name. */
  readonly key: string;
  readonly name: string;
  readonly type: ProjectType | null;
  readonly leave: boolean;
  readonly rows: ReadonlyArray<ProjectGroupRow>;
  /** Hours per week (leave excluded: leave groups show days away instead). */
  readonly totals: ReadonlyArray<string>;
};

const AWAY_KEY = 'away';

/**
 * The same board response regrouped by project (AC-02b): work projects by type then name, leave
 * after them; leave the viewer may not name (`project: null`) all goes into one «Away» group
 * (AC-29). Grouping is a view of the board's data, not another query.
 */
export function groupByProject(board: Board): ReadonlyArray<ProjectGroup> {
  type Acc = {
    key: string;
    name: string;
    type: ProjectType | null;
    leave: boolean;
    byRow: Map<BoardRow, BoardAllocation[]>;
  };
  const groups = new Map<string, Acc>();
  for (const row of board.rows) {
    for (const allocation of row.allocations) {
      const key = allocation.project?.id ?? AWAY_KEY;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          name: allocationName(allocation),
          type: allocation.project?.type ?? null,
          leave: allocation.away,
          byRow: new Map(),
        };
        groups.set(key, group);
      }
      group.byRow.set(row, [...(group.byRow.get(row) ?? []), allocation]);
    }
  }

  // Leave groups a resource has in each week: when more than one, days can't be split by type.
  const leaveGroupsIn = (row: BoardRow, week: string) =>
    [...groups.values()].filter(
      (g) => g.leave && (g.byRow.get(row) ?? []).some((a) => minutesIn(a, week) > 0),
    ).length;

  const rank = (g: Acc) => (g.type === null ? TYPE_ORDER.length : TYPE_ORDER.indexOf(g.type));
  return [...groups.values()]
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'en'))
    .map((group) => {
      const rows = [...group.byRow.entries()]
        .sort(([a], [b]) => a.employee.fullName.localeCompare(b.employee.fullName, 'en'))
        .map(([row, allocations]) => ({
          row,
          cells: board.weeks.map((week, i): ProjectCell => {
            const cell = row.cells[i];
            const minutes = allocations.reduce((sum, a) => sum + minutesIn(a, week), 0);
            const weekView = cell ? cellView(cell) : cellView(emptyCell(week));
            if (!group.leave) {
              return {
                hours: minutes > 0 ? `${hours(minutes)}h` : null,
                away: null,
                week: weekView,
              };
            }
            const days = cell?.leaveDays ?? 0;
            const away =
              minutes <= 0 && days === 0
                ? null
                : days > 0 && leaveGroupsIn(row, week) <= 1
                  ? `Away · ${days}d`
                  : `Away · ${hours(minutes)}h`;
            return { hours: null, away, week: weekView };
          }),
        }));
      const totals = board.weeks.map((week, i) => {
        if (group.leave) {
          const days = rows.reduce(
            (sum, r) => sum + (r.cells[i]?.away ? (r.row.cells[i]?.leaveDays ?? 0) : 0),
            0,
          );
          return days > 0 ? `${days}d away` : '';
        }
        const minutes = [...group.byRow.values()]
          .flat()
          .reduce((sum, a) => sum + minutesIn(a, week), 0);
        return minutes > 0 ? `${hours(minutes)}h` : '';
      });
      return {
        key: group.key,
        name: group.name,
        type: group.type,
        leave: group.leave,
        rows,
        totals,
      };
    });
}

const emptyCell = (weekStart: string): BoardCell => ({
  weekStart,
  state: 'non-working',
  allocatedMinutes: 0,
  capacityMinutes: 0,
  leaveDays: 0,
});

/** «16 Nov» chip on a row whose employment ends in or before the window's end (AC-21). */
export const endsWithin = (row: BoardRow, board: Board) =>
  row.employmentEnd !== null && row.employmentEnd <= board.to ? row.employmentEnd : null;
