import type { BoardAllocation, MySchedule } from '@arv/contracts/scheduling';
import { ClockIcon, LockIcon, PlaneIcon, UserXIcon } from 'lucide-react';
import { cn } from '~/shared/lib/utils';
import { Badge } from '~/shared/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import {
  allocationName,
  type CellView,
  cellView,
  dayMonth,
  hours,
  isoWeek,
  minutesIn,
  TYPE_LABEL,
  weekName,
  weekRange,
} from '../board';
import { AllocationBlock, cellTone, StateIcon, TypeChip, WeekCell } from './board-cell';
import { currentTint, weekWhen } from './board-grid';

/** «8h / day», «40h / week», «Full working days» (leave, AC-15); «Varies» across segments. */
export function rateLabel(allocation: BoardAllocation): string {
  const labels = new Set(
    allocation.segments.map((segment) =>
      segment.ratePeriod === 'full-day' || segment.rateMinutes === null
        ? 'Full working days'
        : `${hours(segment.rateMinutes)}h / ${segment.ratePeriod}`,
    ),
  );
  return labels.size === 1 ? ([...labels][0] ?? '') : 'Varies';
}

/** «2 Nov – 31 Dec»: the allocation's first start to its last end. */
export function spanLabel(allocation: BoardAllocation): string {
  const first = allocation.segments[0];
  const last = allocation.segments[allocation.segments.length - 1];
  return first && last ? `${dayMonth(first.startsOn)} – ${dayMonth(last.endsOn)}` : '';
}

/** The allocations with hours in `week`, leave apart: the resource always sees their own leave type (AC-17). */
function inWeek(schedule: MySchedule, week: string) {
  const here = schedule.allocations.filter((a) => minutesIn(a, week) > 0);
  return { work: here.filter((a) => !a.away), leave: here.filter((a) => a.away) };
}

/** «Away · 2d · Sick leave». */
function awayLine(view: CellView, leave: ReadonlyArray<BoardAllocation>): string | null {
  if (!view.away) return null;
  const names = [...new Set(leave.map(allocationName))];
  return names.length > 0 ? `${view.away} · ${names.join(', ')}` : view.away;
}

/**
 * Desktop: the window's weeks side by side, as on the board, but one row and no editing (AC-17).
 */
export function MyWeekStrip({
  schedule,
  currentMonday,
}: {
  schedule: MySchedule;
  currentMonday: string;
}) {
  return (
    <section
      aria-label="My weeks"
      className="overflow-x-auto rounded-lg border border-border bg-background"
    >
      <table
        aria-label="My schedule, one column per week"
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
        style={{ minWidth: `${schedule.weeks.length * 88}px` }}
      >
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            {schedule.weeks.map((week, i) => {
              const when = weekWhen(week, currentMonday);
              return (
                <TableHead
                  key={week}
                  scope="col"
                  title={`${weekName(week)} · ${weekRange(week)}`}
                  className={cn(
                    'h-14 overflow-hidden border-b border-border bg-background px-2 text-xs leading-4 font-normal',
                    i > 0 && 'border-l',
                    when === 'current' && cn(currentTint, 'shadow-[inset_0_2px_0_var(--primary)]'),
                  )}
                >
                  <span className="flex flex-col">
                    <span
                      className={cn('num font-medium', when === 'past' && 'text-muted-foreground')}
                    >
                      W{isoWeek(week)}
                    </span>
                    <span className="text-muted-foreground">{dayMonth(week)}</span>
                    {when === 'past' ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <LockIcon aria-hidden="true" className="size-3" />
                        Past
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
        <TableBody>
          <TableRow className="hover:bg-transparent">
            {schedule.weeks.map((week, i) => {
              const cell = schedule.cells[i];
              if (!cell) return <TableCell key={week} className={cn('p-0', i > 0 && 'border-l')} />;
              const view = cellView(cell);
              const when = weekWhen(week, currentMonday);
              return (
                <TableCell
                  key={week}
                  aria-label={`${weekName(week)}: ${view.description}`}
                  className={cn(
                    'relative p-0 whitespace-normal',
                    i > 0 && 'border-l border-l-border/60',
                    when === 'current' && currentTint,
                    cellTone(view.kind),
                    when === 'past' && view.kind !== 'overbooked' && 'text-muted-foreground',
                  )}
                >
                  <WeekCell view={view} />
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </table>
    </section>
  );
}

/**
 * Phone (390 px): one card per week, top to bottom in window order, so the default window shows
 * the current week first (PRD §6 Device support).
 */
export function MyWeekCards({
  schedule,
  currentMonday,
}: {
  schedule: MySchedule;
  currentMonday: string;
}) {
  return (
    <ol aria-label="My weeks, current week first" className="flex flex-col gap-2">
      {schedule.weeks.map((week, i) => {
        const cell = schedule.cells[i];
        if (!cell) return null;
        const view = cellView(cell);
        const when = weekWhen(week, currentMonday);
        const { work, leave } = inWeek(schedule, week);
        const away = awayLine(view, leave);
        return (
          <li
            key={week}
            data-state={view.kind}
            aria-label={`W${isoWeek(week)}, ${weekRange(week)}: ${view.description}`}
            className={cn(
              'rounded-lg border border-border bg-background p-3',
              when === 'current' && 'border-foreground shadow-[inset_3px_0_0_var(--primary)]',
              when === 'past' && 'bg-muted/50',
              view.kind === 'overbooked' && 'bg-overload/[0.05]',
            )}
          >
            <div className="flex items-center gap-2 text-[13px] leading-5">
              <span className="num font-semibold">W{isoWeek(week)}</span>
              <span className="num text-muted-foreground">· {weekRange(week)}</span>
              {when === 'current' ? (
                <Badge className="ml-auto">This week</Badge>
              ) : when === 'past' ? (
                <Badge variant="secondary" className="ml-auto">
                  Past
                </Badge>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <StateIcon kind={view.kind} className="size-4" />
              <span className="font-medium">{view.label}</span>
              <span className="num ml-auto text-base font-semibold">{view.figure}</span>
            </div>
            {view.note ? <div className="mt-0.5 text-xs font-medium">{view.note}</div> : null}
            <span
              aria-hidden="true"
              className="mt-2 block h-1 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn(
                  'block h-full',
                  view.kind === 'overbooked' ? 'bg-overload' : 'bg-ring',
                )}
                style={{ width: `${view.fill}%` }}
              />
            </span>
            {away ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-[13px] leading-5">
                <PlaneIcon aria-hidden="true" className="size-3.5 shrink-0" />
                <span>{away}</span>
              </div>
            ) : null}
            {work.length > 0 ? (
              <ul
                aria-label="Allocations this week"
                className="mt-2 flex flex-col gap-1 border-t border-border pt-2"
              >
                {work.map((allocation) => (
                  <li key={allocation.id} className="flex items-center gap-2 text-[13px] leading-5">
                    <AllocationBlock allocation={allocation} className="size-3 rounded-[2px]">
                      {null}
                    </AllocationBlock>
                    <span className="min-w-0 truncate">{allocationName(allocation)}</span>
                    <span className="num ml-auto">{hours(minutesIn(allocation, week))}h</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 border-t border-border pt-2 text-[13px] leading-5 text-muted-foreground">
                No allocations this week.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Every allocation in the window, own leave named with its type (AC-17). */
export function MyAllocations({ schedule }: { schedule: MySchedule }) {
  return (
    <section aria-labelledby="my-allocations" className="flex flex-col gap-2">
      <h2 id="my-allocations" className="text-base font-semibold">
        My allocations
      </h2>
      {schedule.allocations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {schedule.weeks.length === 1
            ? 'No allocations this week.'
            : `No allocations in these ${schedule.weeks.length} weeks.`}
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Project</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">In these weeks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.allocations.map((allocation) => {
                const minutes = allocation.minutesPerWeek.reduce((sum, w) => sum + w.minutes, 0);
                return (
                  <TableRow key={allocation.id}>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2">
                        <AllocationBlock allocation={allocation} className="size-3 rounded-[2px]">
                          {null}
                        </AllocationBlock>
                        <span className="truncate">{allocationName(allocation)}</span>
                        {allocation.project ? (
                          <TypeChip leave={allocation.away}>
                            {TYPE_LABEL[allocation.project.type]}
                          </TypeChip>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="num">{spanLabel(allocation)}</TableCell>
                    <TableCell className="num text-right">{rateLabel(allocation)}</TableCell>
                    <TableCell className="num text-right">{hours(minutes)}h</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Your schedule is read-only. Ask a planner to change an allocation.
      </p>
    </section>
  );
}

/** AC-18: the login is not linked to an employee record. */
export function NotSetUp() {
  return (
    <div className="mx-auto my-24 flex max-w-sm flex-col items-center gap-3 px-4 text-center max-sm:my-12">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground"
      >
        <UserXIcon className="size-5" />
      </span>
      <p>
        You’re not set up as a resource yet. Someone who manages employee records can link your
        login.
      </p>
    </div>
  );
}
