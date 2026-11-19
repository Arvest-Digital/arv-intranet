import type { Board, BoardAllocation, BoardRow } from '@arv/contracts/scheduling';
import { ChevronDownIcon, ClockIcon, LockIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '~/shared/lib/utils';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import {
  allocationName,
  cellView,
  dayMonth,
  endsWithin,
  groupByTeam,
  hours,
  isoWeek,
  minutesIn,
  TYPE_LABEL,
  weekName,
  weekRange,
} from '../board';
import { AllocationBlock, cellTone, TypeChip, WeekCell, WeekDetailCell } from './board-cell';

/** Where a week sits relative to today, for its tint and «view only» (AC-01). */
export const weekWhen = (week: string, currentMonday: string) =>
  week < currentMonday ? 'past' : week === currentMonday ? 'current' : 'future';

/**
 * The current week's column tint: light enough that muted text on it keeps 4.5:1 (QS-7).
 */
export const currentTint = 'bg-[color-mix(in_oklch,var(--foreground)_1.5%,var(--background))]';

/** A row without the list table's hover and divider (the board draws borders per cell). */
export const rowClass = 'border-b-0 hover:bg-transparent has-aria-expanded:bg-transparent';

/** The sticky first column of a body row. */
export const nameCellClass =
  'sticky left-0 z-[5] border-r border-b border-border bg-background p-0 whitespace-normal';
export const nameInnerClass = 'flex min-h-11 min-w-0 items-center gap-2 py-1.5 pr-3 pl-2';

/** A week cell's frame. */
export const weekCellClass =
  'relative min-w-0 border-b border-l border-b-border border-l-border/60 p-0 whitespace-normal';

/** Group header rows (a team, a project) sit on the quiet surface. */
// Opaque (it is sticky) and no darker than half of --muted, so muted text keeps 4.5:1.
export const groupNameClass = cn(
  nameCellClass,
  'bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))]',
);
export const groupCellClass =
  'h-9 border-b border-l border-b-border border-l-border/60 bg-muted/50 px-2 text-xs whitespace-nowrap text-muted-foreground';

/** Up to two initials: «Olena Kovalenko» → «OK». */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-secondary text-xs font-medium"
    >
      {initials(name)}
    </span>
  );
}

export function ExpandToggle({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
      onClick={onToggle}
      className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <ChevronDownIcon
        aria-hidden="true"
        className={cn('size-4 transition-transform duration-150 ease-out', !open && '-rotate-90')}
      />
    </button>
  );
}

/** The person's name column: avatar, name, «Ends 15 Dec» (AC-21) and team. */
export function PersonName({
  row,
  board,
  lead,
}: {
  row: BoardRow;
  board: Board;
  lead?: React.ReactNode;
}) {
  const end = endsWithin(row, board);
  const name = row.employee.fullName;
  return (
    <div className={nameInnerClass}>
      {lead ?? <span className="w-6 shrink-0" />}
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{name}</span>
          {end ? (
            <TypeChip title={`Employment ends ${end}`}>
              Ends <span className="num">{dayMonth(end)}</span>
            </TypeChip>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.employee.team?.name ?? 'No team'}
        </div>
      </div>
    </div>
  );
}

/**
 * The board's table: a sticky name column and sticky week header (both inside the board's scroll
 * box), one column per week — one wide one at the 1-week zoom.
 */
export function BoardTable({
  board,
  currentMonday,
  label,
  title,
  count,
  children,
}: {
  board: Board;
  currentMonday: string;
  label: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const one = board.weeks.length === 1;
  return (
    <table
      aria-label={label}
      className="w-full table-fixed border-separate border-spacing-0 text-sm"
      style={{
        minWidth: one
          ? 'calc(var(--namew) + 640px)'
          : `calc(var(--namew) + ${board.weeks.length * 80}px)`,
      }}
    >
      <colgroup>
        <col style={{ width: 'var(--namew)' }} />
        {board.weeks.map((week) => (
          <col key={week} />
        ))}
      </colgroup>
      <TableHeader className="[&_tr]:border-b-0">
        <TableRow className={rowClass}>
          <TableHead className="sticky top-0 left-0 z-20 h-14 border-r border-b border-border bg-background px-3 text-xs font-normal text-muted-foreground">
            <span className="flex items-center justify-between">
              <span>{title}</span>
              <span className="num">{count}</span>
            </span>
          </TableHead>
          {board.weeks.map((week) => {
            const when = weekWhen(week, currentMonday);
            return (
              <TableHead
                key={week}
                scope="col"
                title={`${weekName(week)} · ${weekRange(week)}${when === 'past' ? ' · Past week, view only' : ''}`}
                className={cn(
                  'sticky top-0 z-10 h-14 overflow-hidden border-b border-l border-border bg-background px-2 text-xs leading-4 font-normal',
                  when === 'current' && cn(currentTint, 'shadow-[inset_0_2px_0_var(--primary)]'),
                )}
              >
                <span className="flex flex-col">
                  <span
                    className={cn('num font-medium', when === 'past' && 'text-muted-foreground')}
                  >
                    W{isoWeek(week)}
                  </span>
                  <span className="text-muted-foreground">
                    {one ? weekRange(week) : dayMonth(week)}
                  </span>
                  {when === 'past' ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <LockIcon aria-hidden="true" className="size-3" />
                      View only
                    </span>
                  ) : when === 'current' ? (
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon aria-hidden="true" className="size-3" />
                      This week
                    </span>
                  ) : null}
                </span>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      {children}
    </table>
  );
}

/** The span of an allocation's segments in the window: «2 Nov – 31 Dec». */
const spanOf = (allocation: BoardAllocation) => {
  const first = allocation.segments[0];
  const last = allocation.segments[allocation.segments.length - 1];
  return first && last ? `${dayMonth(first.startsOn)} – ${dayMonth(last.endsOn)}` : '';
};

/** One allocation of an expanded person row: its hours per week as project blocks. */
function AllocationRow({
  allocation,
  board,
  currentMonday,
}: {
  allocation: BoardAllocation;
  board: Board;
  currentMonday: string;
}) {
  const name = allocationName(allocation);
  return (
    <TableRow className={cn(rowClass, 'group')}>
      <TableHead scope="row" className={cn(nameCellClass, 'h-9 font-normal')}>
        <div className="min-w-0 py-1 pr-3 pl-16">
          <div className="flex min-w-0 items-center gap-1.5">
            {allocation.project ? (
              <TypeChip leave={allocation.away}>{TYPE_LABEL[allocation.project.type]}</TypeChip>
            ) : null}
            <span className="truncate font-medium">{name}</span>
          </div>
          <div className="num truncate text-xs text-muted-foreground opacity-0 transition-opacity duration-150 ease-out group-focus-within:opacity-100 group-hover:opacity-100">
            {spanOf(allocation)}
          </div>
        </div>
      </TableHead>
      {board.weeks.map((week) => {
        const minutes = minutesIn(allocation, week);
        const when = weekWhen(week, currentMonday);
        return (
          <TableCell
            key={week}
            className={cn(weekCellClass, 'p-1', when === 'current' && currentTint)}
          >
            {minutes > 0 ? (
              <AllocationBlock
                allocation={allocation}
                className="h-7 w-full px-2 text-xs font-medium"
              >
                <span className="num" title={`${name}, ${weekName(week)}: ${hours(minutes)}h`}>
                  {hours(minutes)}h
                </span>
              </AllocationBlock>
            ) : null}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function PersonRow({
  row,
  board,
  currentMonday,
}: {
  row: BoardRow;
  board: Board;
  currentMonday: string;
}) {
  const [open, setOpen] = useState(false);
  const one = board.weeks.length === 1;
  const name = row.employee.fullName;
  const inWindow = row.allocations.filter((a) => board.weeks.some((w) => minutesIn(a, w) > 0));
  return (
    <>
      <TableRow className={rowClass}>
        <TableHead scope="row" className={cn(nameCellClass, 'font-normal')}>
          <PersonName
            row={row}
            board={board}
            lead={
              !one && inWindow.length > 0 ? (
                <ExpandToggle
                  open={open}
                  label={`allocations for ${name}`}
                  onToggle={() => setOpen(!open)}
                />
              ) : undefined
            }
          />
        </TableHead>
        {board.weeks.map((week, i) => {
          const cell = row.cells[i];
          if (!cell) return <TableCell key={week} className={weekCellClass} />;
          const view = cellView(cell);
          const when = weekWhen(week, currentMonday);
          return (
            <TableCell
              key={week}
              aria-label={`${name}, ${weekName(week)}: ${view.description}`}
              className={cn(
                weekCellClass,
                when === 'current' && currentTint,
                cellTone(view.kind),
                // Past weeks read quieter, but not over the overbooked tint (contrast, QS-7).
                when === 'past' && view.kind !== 'overbooked' && 'text-muted-foreground',
              )}
            >
              {one ? (
                <WeekDetailCell
                  view={view}
                  week={week}
                  allocations={row.allocations}
                  personName={name}
                />
              ) : (
                <WeekCell view={view} />
              )}
            </TableCell>
          );
        })}
      </TableRow>
      {open && !one
        ? inWindow.map((allocation) => (
            <AllocationRow
              key={allocation.id}
              allocation={allocation}
              board={board}
              currentMonday={currentMonday}
            />
          ))
        : null}
    </>
  );
}

function TeamRows({
  group,
  board,
  currentMonday,
}: {
  group: ReturnType<typeof groupByTeam>[number];
  board: Board;
  currentMonday: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <TableBody className="[&_tr:last-child]:border-b-0">
      <TableRow className={rowClass}>
        <TableHead scope="rowgroup" className={cn(groupNameClass, 'font-normal')}>
          <div className="flex h-9 min-w-0 items-center gap-2 pr-3 pl-2">
            <ExpandToggle
              open={open}
              label={`team ${group.name}`}
              onToggle={() => setOpen(!open)}
            />
            <span className="truncate font-semibold">{group.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {group.rows.length} {group.rows.length === 1 ? 'person' : 'people'}
            </span>
          </div>
        </TableHead>
        {group.totals.map((total, i) => (
          <TableCell key={board.weeks[i]} title={total.title} className={groupCellClass}>
            <span className="flex items-center gap-1.5">
              <span className="num">{total.figure}</span>
              {total.over > 0 ? (
                <span className="inline-flex items-center gap-0.5 font-medium text-overload">
                  <TriangleAlertIcon aria-hidden="true" className="size-3" />
                  {total.over} over
                </span>
              ) : null}
            </span>
          </TableCell>
        ))}
      </TableRow>
      {open
        ? group.rows.map((row) => (
            <PersonRow
              key={row.employee.id}
              row={row}
              board={board}
              currentMonday={currentMonday}
            />
          ))
        : null}
    </TableBody>
  );
}

/**
 * The board by people (AC-01): resources grouped by team with each team's weekly total, one cell
 * per week. A person row expands into their allocations as project blocks.
 */
export function PeopleGrid({ board, currentMonday }: { board: Board; currentMonday: string }) {
  return (
    <BoardTable
      board={board}
      currentMonday={currentMonday}
      label="Team schedule, one column per week"
      title="People"
      count={board.rows.length}
    >
      {groupByTeam(board).map((group) => (
        <TeamRows key={group.name} group={group} board={board} currentMonday={currentMonday} />
      ))}
    </BoardTable>
  );
}
