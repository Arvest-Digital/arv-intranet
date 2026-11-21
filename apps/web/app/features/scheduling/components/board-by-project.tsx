import type { Board } from '@arv/contracts/scheduling';
import { PlaneIcon } from 'lucide-react';
import { useState } from 'react';
import { projectColorStyle } from '~/shared/lib/project-color';
import { cn } from '~/shared/lib/utils';
import { TableBody, TableCell, TableHead, TableRow } from '~/shared/ui/table';
import {
  type CellView,
  groupByProject,
  type ProjectCell,
  type ProjectGroup,
  TYPE_LABEL,
  weekName,
} from '../board';
import { StateIcon, TypeChip } from './board-cell';
import {
  BoardTable,
  currentTint,
  ExpandToggle,
  groupCellClass,
  groupNameClass,
  nameCellClass,
  PersonName,
  rowClass,
  weekCellClass,
  weekWhen,
} from './board-grid';

function Swatch({ group }: { group: ProjectGroup }) {
  return group.leave ? (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-[2px] border border-l-3 border-dashed border-ring bg-muted/50"
    />
  ) : (
    <span
      aria-hidden="true"
      className="project-block size-3 shrink-0 rounded-[2px]"
      style={projectColorStyle(group.key)}
    />
  );
}

const quietKinds = new Set(['free', 'partly-booked', 'fully-booked']);

/** The resource's whole-week state beside their hours on the project (AC-02b). */
function WholeWeek({ view, wide }: { view: CellView; wide: boolean }) {
  const quiet = quietKinds.has(view.kind);
  return (
    <span
      className={cn(
        'flex items-center gap-1 pl-0.5 text-xs whitespace-nowrap',
        quiet && 'text-muted-foreground',
        (view.kind === 'overbooked' || view.kind === 'needs-attention') && 'font-medium',
        wide && 'gap-1.5 text-[13px]',
      )}
    >
      <StateIcon kind={view.kind} className={wide ? 'size-3.5' : 'size-3'} />
      <span className={wide ? 'font-medium' : 'sr-only'}>
        {view.label}
        {wide ? ' ·' : ''}
      </span>
      <span className="num">{view.figure}</span>
      {view.kind === 'overbooked' && view.note ? (
        <span>{view.note.replace(' over', '')}</span>
      ) : null}
    </span>
  );
}

function ProjectWeekCell({
  cell,
  group,
  wide,
}: {
  cell: ProjectCell;
  group: ProjectGroup;
  wide: boolean;
}) {
  if (cell.away !== null) {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-dashed border-ring bg-muted/50 px-2 text-xs font-medium whitespace-nowrap">
        <PlaneIcon aria-hidden="true" className="size-3" />
        {cell.away}
      </span>
    );
  }
  if (cell.hours === null) return null;
  return (
    <div className={cn('flex flex-col gap-0.5', wide && 'flex-row items-center gap-4')}>
      <span
        className={cn(
          'project-block num flex h-6 items-center pr-2 pl-1.5 text-[13px] font-medium',
          wide && 'min-w-16',
        )}
        style={projectColorStyle(group.key)}
      >
        {cell.hours}
      </span>
      <WholeWeek view={cell.week} wide={wide} />
    </div>
  );
}

function ProjectRows({
  group,
  board,
  currentMonday,
}: {
  group: ProjectGroup;
  board: Board;
  currentMonday: string;
}) {
  const [open, setOpen] = useState(true);
  const one = board.weeks.length === 1;
  return (
    <TableBody className="[&_tr:last-child]:border-b-0">
      <TableRow className={rowClass}>
        <TableHead scope="rowgroup" className={cn(groupNameClass, 'font-normal')}>
          <div className="flex h-9 min-w-0 items-center gap-2 pr-3 pl-2">
            <ExpandToggle
              open={open}
              label={`${group.name} people`}
              onToggle={() => setOpen(!open)}
            />
            <Swatch group={group} />
            <span className="truncate font-semibold">{group.name}</span>
            {group.type ? <TypeChip leave={group.leave}>{TYPE_LABEL[group.type]}</TypeChip> : null}
            <span className="shrink-0 text-muted-foreground">
              {group.rows.length} {group.rows.length === 1 ? 'person' : 'people'}
            </span>
          </div>
        </TableHead>
        {group.totals.map((total, i) => {
          const week = board.weeks[i] ?? '';
          return (
            <TableCell
              key={week}
              title={
                group.leave
                  ? `${group.name}, ${weekName(week)}: ${total || 'nobody away'} (not counted as work hours)`
                  : `${group.name}, ${weekName(week)}: ${total || '0h'} booked`
              }
              className={cn(groupCellClass, 'num')}
            >
              {total}
            </TableCell>
          );
        })}
      </TableRow>
      {open
        ? group.rows.map(({ row, cells }) => (
            <TableRow key={row.employee.id} className={rowClass}>
              <TableHead scope="row" className={cn(nameCellClass, 'font-normal')}>
                <PersonName row={row} board={board} />
              </TableHead>
              {cells.map((cell, i) => {
                const week = board.weeks[i] ?? '';
                const when = weekWhen(week, currentMonday);
                const has = cell.hours !== null || cell.away !== null;
                return (
                  <TableCell
                    key={week}
                    data-state={has ? cell.week.kind : undefined}
                    aria-label={
                      has
                        ? `${row.employee.fullName}, ${weekName(week)}: ${group.name} ${cell.hours ?? cell.away}, whole week ${cell.week.description}`
                        : undefined
                    }
                    title={has ? `Whole week: ${cell.week.description}` : undefined}
                    className={cn(
                      weekCellClass,
                      one ? 'px-3 py-2' : 'p-1',
                      when === 'current' && currentTint,
                    )}
                  >
                    <ProjectWeekCell cell={cell} group={group} wide={one} />
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        : null}
    </TableBody>
  );
}

/**
 * The board by project (AC-02b): the same response regrouped — each project with its weekly total
 * (leave excluded), and per resource their hours on it next to their whole-week state. Redacted
 * leave all goes into one «Away» group (AC-29).
 */
export function ProjectGrid({ board, currentMonday }: { board: Board; currentMonday: string }) {
  const groups = groupByProject(board);
  return (
    <BoardTable
      board={board}
      currentMonday={currentMonday}
      label="Schedule by project, one column per week"
      title="Projects"
      count={groups.length}
    >
      {groups.map((group) => (
        <ProjectRows key={group.key} group={group} board={board} currentMonday={currentMonday} />
      ))}
    </BoardTable>
  );
}
