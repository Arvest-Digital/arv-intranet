import type { BoardAllocation } from '@arv/contracts/scheduling';
import {
  BanIcon,
  CalendarXIcon,
  CircleCheckIcon,
  CircleIcon,
  CircleQuestionMarkIcon,
  ContrastIcon,
  type LucideIcon,
  PlaneIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { projectColorStyle } from '~/shared/lib/project-color';
import { cn } from '~/shared/lib/utils';
import {
  allocationName,
  type CellKind,
  type CellView,
  hours,
  minutesIn,
  TYPE_LABEL,
} from '../board';

/** One icon per state, so states differ by shape as well as by text (QS-7). */
export const STATE_ICON: Record<CellKind, LucideIcon> = {
  free: CircleIcon,
  'partly-booked': ContrastIcon,
  'fully-booked': CircleCheckIcon,
  overbooked: TriangleAlertIcon,
  'non-working': BanIcon,
  'incomplete-record': CircleQuestionMarkIcon,
  'needs-attention': CalendarXIcon,
};

export function StateIcon({ kind, className }: { kind: CellKind; className?: string }) {
  const Icon = STATE_ICON[kind];
  return (
    <Icon
      aria-hidden="true"
      className={cn('size-3.5 shrink-0', kind === 'overbooked' && 'text-overload', className)}
    />
  );
}

/** Cell surface per state: overbooked tinted, non-working quiet, capacity unknown hatched. */
export const cellTone = (kind: CellKind) =>
  cn(
    kind === 'overbooked' && 'bg-overload/[0.07]',
    kind === 'non-working' && 'bg-muted/50',
    kind === 'incomplete-record' &&
      'bg-[repeating-linear-gradient(135deg,var(--border)_0_1px,transparent_1px_6px)]',
  );

const quietText = (kind: CellKind) =>
  kind === 'free' || kind === 'non-working' || kind === 'incomplete-record';

/** The thin booked-share bar along the bottom of a cell. */
function FillBar({ view, className }: { view: CellView; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block overflow-hidden rounded-full bg-muted', className)}
    >
      <span
        className={cn(
          'block h-full',
          view.kind === 'overbooked'
            ? 'bg-overload'
            : view.kind === 'needs-attention'
              ? 'bg-foreground'
              : 'bg-ring',
        )}
        style={{ width: `${view.fill}%` }}
      />
    </span>
  );
}

/**
 * A week cell in the multi-week grid: state icon, «allocated/capacity», the note (over, capacity
 * unknown, past end) and «away · N days». The state's text label is part of the cell's text.
 */
export function WeekCell({ view }: { view: CellView }) {
  return (
    <div
      data-state={view.kind}
      title={view.description}
      className={cn(
        'relative flex min-h-11 flex-col justify-center px-2 pt-1 pb-1.5',
        quietText(view.kind) && 'text-muted-foreground',
        view.kind === 'needs-attention' &&
          'outline-1 -outline-offset-4 outline-foreground outline-dashed',
      )}
    >
      <span className="sr-only">{view.label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <StateIcon kind={view.kind} />
        <span
          className={cn(
            'num text-[13px] leading-5 whitespace-nowrap',
            view.kind === 'free' ? 'font-normal' : 'font-medium',
          )}
        >
          {view.figure}
        </span>
      </span>
      {view.note ? (
        <span
          className={cn(
            'truncate text-xs',
            (view.kind === 'overbooked' || view.kind === 'needs-attention') && 'font-medium',
          )}
        >
          {view.note}
        </span>
      ) : null}
      {view.away ? (
        <span className="inline-flex items-center gap-1 truncate text-xs">
          <PlaneIcon aria-hidden="true" className="size-3 shrink-0" />
          {view.away}
        </span>
      ) : null}
      <FillBar view={view} className="absolute inset-x-2 bottom-[3px] h-0.5" />
    </div>
  );
}

/** A project's coloured block, or the dashed «Away» block for leave. */
export function AllocationBlock({
  allocation,
  children,
  className,
}: {
  allocation: BoardAllocation;
  children: React.ReactNode;
  className?: string;
}) {
  const leave = allocation.away;
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-sm',
        leave
          ? 'border border-l-3 border-dashed border-ring bg-muted/50 text-foreground'
          : 'project-block',
        className,
      )}
      style={leave || !allocation.project ? undefined : projectColorStyle(allocation.project.id)}
    >
      {children}
    </span>
  );
}

/**
 * The 1-week zoom's wide cell: the state label and figure with a bar, the hours per project from
 * `minutesPerWeek`, and «away · N days».
 */
export function WeekDetailCell({
  view,
  week,
  allocations,
  personName,
}: {
  view: CellView;
  week: string;
  allocations: ReadonlyArray<BoardAllocation>;
  personName: string;
}) {
  const thisWeek = allocations.filter((a) => minutesIn(a, week) > 0);
  return (
    <div
      data-state={view.kind}
      className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] items-start gap-x-8 gap-y-2 py-2.5 pr-4 pl-3 max-md:grid-cols-1"
    >
      <div
        className={cn(
          'flex flex-col gap-1.5 pt-1.5',
          view.kind === 'needs-attention' &&
            'rounded-xs outline-1 outline-offset-4 outline-foreground outline-dashed',
        )}
      >
        <div className="flex items-center gap-2">
          <StateIcon kind={view.kind} className="size-4" />
          <span className={cn('font-medium', quietText(view.kind) && 'text-muted-foreground')}>
            {view.label}
          </span>
          {view.kind === 'incomplete-record' ? null : (
            <span className="num ml-auto font-semibold">{view.figure}</span>
          )}
        </div>
        <FillBar view={view} className="h-1" />
        {view.note ? <span className="text-xs font-medium">{view.note}</span> : null}
      </div>
      <ul aria-label={`Allocations for ${personName} this week`} className="flex flex-wrap gap-1.5">
        {thisWeek.length === 0 ? (
          <li className="text-[13px] leading-8 text-muted-foreground">No allocations this week</li>
        ) : (
          thisWeek.map((allocation) => (
            <li key={allocation.id}>
              <span className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background pr-2.5 pl-2 text-[13px]">
                <AllocationBlock allocation={allocation} className="size-3 rounded-[2px]">
                  {null}
                </AllocationBlock>
                <span>{allocationName(allocation)}</span>
                {allocation.project ? (
                  <TypeChip leave={allocation.away}>{TYPE_LABEL[allocation.project.type]}</TypeChip>
                ) : null}
                <span className="num font-semibold">{hours(minutesIn(allocation, week))}h</span>
              </span>
            </li>
          ))
        )}
      </ul>
      {view.away ? (
        <span className="inline-flex h-8 items-center gap-1.5 text-[13px] font-medium whitespace-nowrap">
          <PlaneIcon aria-hidden="true" className="size-3.5" />
          {view.away}
        </span>
      ) : null}
    </div>
  );
}

/** A small bordered label: a project type, «Ends 15 Dec». Leave gets a dashed border. */
export function TypeChip({
  children,
  leave = false,
  title,
}: {
  children: React.ReactNode;
  leave?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 text-xs font-medium whitespace-nowrap',
        leave && 'border-dashed',
      )}
    >
      {children}
    </span>
  );
}
