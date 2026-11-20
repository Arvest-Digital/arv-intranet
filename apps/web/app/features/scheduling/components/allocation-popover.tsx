import type { BoardAllocation, BoardCell } from '@arv/contracts/scheduling';
import { PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { createContext, useContext } from 'react';
import { projectColorStyle } from '~/shared/lib/project-color';
import { cn } from '~/shared/lib/utils';
import { Button } from '~/shared/ui/button';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '~/shared/ui/popover';
import { allocationTerms, changedAtText, firstName, rateText } from '../allocation';
import { allocationName, hours, mondayOf, TYPE_LABEL, weekName } from '../board';
import type { AllocationDialogState } from './allocation-dialog';
import { TypeChip } from './board-cell';

/**
 * What the board offers to edit: set by the board route for holders of edit-allocations, absent
 * for viewers (and in tests that render the grid alone), so the grid shows no edit controls.
 */
export type AllocationEditing = {
  readonly canEdit: boolean;
  readonly today: string;
  readonly open: (state: AllocationDialogState) => void;
};

export const AllocationEditingContext = createContext<AllocationEditing | null>(null);

export const useAllocationEditing = () => useContext(AllocationEditingContext);

/**
 * «New allocation» over an empty part of a week cell: opens the dialog for this person from this
 * week (US-03). Only for editors, and only from the current week on (past weeks are view only).
 */
export function NewAllocationCellButton({
  employeeId,
  employeeName,
  week,
}: {
  employeeId: string;
  employeeName: string;
  week: string;
}) {
  const editing = useAllocationEditing();
  if (!editing?.canEdit) return null;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`New allocation for ${employeeName} from ${weekName(week)}`}
      onClick={() => editing.open({ mode: 'create', employeeId, startsOn: week, endsOn: null })}
      className="group/new absolute inset-0 z-[1] cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset"
    >
      <PlusIcon
        aria-hidden="true"
        className="absolute top-1 right-1 size-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 ease-out group-hover/new:opacity-100 group-focus-visible/new:opacity-100"
      />
    </button>
  );
}

/**
 * An allocation's block as a button that opens its details (US-03): dates, rate, last changed by
 * (AC-07), the week's overbooking, and — for editors — «Edit» and «Remove». Leave is changed with
 * «Book leave», so a leave allocation offers only «Remove».
 */
export function AllocationPopover({
  allocation,
  employeeName,
  employmentEnd,
  week,
  cell,
  label,
  triggerClassName,
  children,
}: {
  allocation: BoardAllocation;
  employeeName: string;
  employmentEnd: string | null;
  week: string;
  /** The person's cell in that week, for its overbooking. */
  cell: BoardCell | undefined;
  /** The trigger's accessible name. */
  label: string;
  triggerClassName?: string;
  /** The block the trigger shows. */
  children: React.ReactNode;
}) {
  const editing = useAllocationEditing();
  if (!editing) return children;
  const terms = allocationTerms(allocation, editing.today);
  const name = allocationName(allocation);
  const pastWeek = week < mondayOf(editing.today);
  const mayEdit = editing.canEdit && !terms.ended;
  const target = { allocation, employeeName, employmentEnd };
  const over =
    cell?.state === 'overbooked' && cell.capacityMinutes !== null
      ? `${firstName(employeeName)} is ${hours(cell.allocatedMinutes - cell.capacityMinutes)}h over capacity in ${weekName(week)} (${hours(cell.allocatedMinutes)}/${hours(cell.capacityMinutes)}).`
      : null;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          'min-w-0 cursor-pointer rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
          triggerClassName,
        )}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] gap-0 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'size-3 shrink-0 rounded-[2px]',
              allocation.project && !allocation.away
                ? 'project-block'
                : 'border border-dashed border-ring bg-muted/50',
            )}
            style={
              allocation.project && !allocation.away
                ? projectColorStyle(allocation.project.id)
                : undefined
            }
          />
          <PopoverTitle className="min-w-0 flex-1 truncate text-sm font-semibold">
            {name}
          </PopoverTitle>
          {allocation.project ? (
            <TypeChip leave={allocation.away}>{TYPE_LABEL[allocation.project.type]}</TypeChip>
          ) : null}
          <PopoverClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
            <XIcon aria-hidden="true" />
          </PopoverClose>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {employeeName} · {weekName(week)}
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-xs leading-5 text-muted-foreground">Dates</dt>
          <dd className="num text-right text-[13px] leading-5">
            {terms.startsOn} – {terms.endsOn}
          </dd>
          <dt className="text-xs leading-5 text-muted-foreground">Rate</dt>
          <dd className="num text-right text-[13px] leading-5">
            {rateText(terms.rateMinutes, terms.ratePeriod)}
          </dd>
          <dt className="text-xs leading-5 text-muted-foreground">This week</dt>
          <dd className="num text-right text-[13px] leading-5">
            {hours(allocation.minutesPerWeek.find((w) => w.weekStart === week)?.minutes ?? 0)}h
          </dd>
          <dt className="text-xs leading-5 text-muted-foreground">Last changed</dt>
          <dd className="text-right text-[13px] leading-5">
            {allocation.lastChangedBy.name} · {changedAtText(allocation.lastChangedAt)}
          </dd>
        </dl>
        {over ? (
          <div className="mt-3 flex gap-2 rounded-md border border-overload/35 bg-overload/5 p-2 text-[13px] leading-5">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-overload"
            />
            <span>{over}</span>
          </div>
        ) : null}
        {pastWeek ? (
          <p className="mt-3 text-xs text-muted-foreground">
            This week is in the past. Past weeks are view only.
          </p>
        ) : null}
        {mayEdit ? (
          <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
            {allocation.away ? null : (
              <PopoverClose
                render={<Button variant="outline" size="sm" />}
                onClick={() => editing.open({ mode: 'edit', target })}
              >
                <PencilIcon aria-hidden="true" />
                Edit
              </PopoverClose>
            )}
            <span className="grow" />
            <PopoverClose
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                />
              }
              onClick={() => editing.open({ mode: 'remove', target })}
            >
              <Trash2Icon aria-hidden="true" />
              Remove
            </PopoverClose>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
