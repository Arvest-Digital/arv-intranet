import type { FreeList } from '@arv/contracts/scheduling';
import { CircleAlertIcon, XIcon } from 'lucide-react';
import { useRef } from 'react';
import { Form, Link, useNavigate } from 'react-router';
import { Button, buttonVariants } from '~/shared/ui/button';
import { Input } from '~/shared/ui/input';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '~/shared/ui/sheet';
import { type BoardParams, boardHref, type FreeParams, MAX_WEEKS } from '../board';
import {
  type FreeListResult,
  freeListNote,
  freeListRows,
  freePeriod,
  nobodyText,
} from '../free-list';
import { Avatar } from './board-grid';

/**
 * Where «Allocate» goes: the board without the drawer, with the allocation dialog (T41) asked for
 * the resource and the list's period, so it opens prefilled.
 */
export function allocateHref(params: BoardParams, employeeId: string, list: FreeList): string {
  const search = new URLSearchParams(boardHref(params, { free: null }).slice(1));
  search.set('allocate', employeeId);
  search.set('allocateFrom', list.from);
  search.set('allocateTo', list.to);
  return `?${search}`;
}

/**
 * «Who's free» (US-02) as a drawer on the board: the query lives in the board URL (`free`,
 * `freeWeeks`, `minFreeHours`) and is a GET form, so every answer is a link. The period counts
 * from today over all teams: the board's window and filters do not apply (AC-04). A bad query
 * shows AC-05's message and no results. Full screen at phone width; the sheet traps focus and
 * closes on Esc.
 */
export function FreeListDrawer({
  params,
  free,
  result,
  canEdit,
}: {
  params: BoardParams;
  free: FreeParams;
  result: FreeListResult;
  /** «Allocate» only for edit-allocations. */
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const hoursInput = useRef<HTMLInputElement>(null);
  const close = () => navigate(boardHref(params, { free: null }), { preventScrollReset: true });
  // The board's own state rides along, so finding keeps the window and filters behind the drawer.
  const kept = [...new URLSearchParams(boardHref(params, { free: null }).slice(1))];
  const invalid = result.kind === 'invalid';
  const badField = (field: 'weeks' | 'minFreeHours') =>
    invalid && (result.fields.length === 0 || result.fields.includes(field));

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        initialFocus={hoursInput}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px] max-sm:border-l-0"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <SheetTitle className="flex-1 text-base font-semibold">Who’s free</SheetTitle>
          <SheetClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                className="max-sm:size-11"
              />
            }
          >
            <XIcon aria-hidden="true" />
          </SheetClose>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <Form
            // Re-mount on a new query so the fields show what the URL holds.
            key={`${free.weeks}|${free.minFreeHours}`}
            method="get"
            role="search"
            aria-label="Find people with free hours"
            // The api judges the values: a bad one gets AC-05's message, not the browser's.
            noValidate
            preventScrollReset
            className="flex flex-wrap items-center gap-1.5 text-[13px] leading-5"
          >
            {kept.map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="free" value="1" />
            <label htmlFor="free-hours">At least</label>
            <Input
              ref={hoursInput}
              id="free-hours"
              name="minFreeHours"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              defaultValue={free.minFreeHours}
              aria-invalid={badField('minFreeHours') || undefined}
              className="num h-8 w-16 px-2 text-right max-sm:h-11"
            />
            <label htmlFor="free-weeks">free hours over the next</label>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Input
                id="free-weeks"
                name="freeWeeks"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_WEEKS}
                step={1}
                defaultValue={free.weeks}
                aria-invalid={badField('weeks') || undefined}
                className="num h-8 w-14 px-2 text-right max-sm:h-11"
              />
              <span>weeks</span>
              <Button type="submit" size="sm" className="max-sm:h-11">
                Find
              </Button>
            </span>
          </Form>
          {result.kind === 'list' ? (
            <FreeListResults params={params} free={free} list={result.list} canEdit={canEdit} />
          ) : (
            <p
              role="alert"
              className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 font-medium text-destructive"
            >
              <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {result.message}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FreeListResults({
  params,
  free,
  list,
  canEdit,
}: {
  params: BoardParams;
  free: FreeParams;
  list: FreeList;
  canEdit: boolean;
}) {
  const rows = freeListRows(list);
  const weeks = Number(free.weeks);
  const minHours = Number(free.minFreeHours);
  const period = freePeriod(list);
  const lower = Math.max(0, minHours / 2);
  const wider = Math.min(MAX_WEEKS, weeks + 1);

  return (
    <>
      <p className="mt-2 text-xs text-muted-foreground">{freeListNote(list)}</p>
      {rows.length > 0 ? (
        <ol
          aria-label="People with free hours, most free first"
          className="mt-4 divide-y divide-border rounded-lg border border-border"
        >
          {rows.map((row) => (
            <li
              key={row.employee.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 p-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={row.employee.fullName} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.employee.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.employee.team?.name ?? 'No team'}
                  </div>
                </div>
              </div>
              <div className="row-span-2 self-center text-right">
                <span className="num block text-2xl font-semibold max-sm:text-xl">{row.total}</span>
                <span className="text-xs text-muted-foreground">free</span>
              </div>
              <ul
                aria-label="Free hours per week"
                className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
              >
                {row.weeks.map((week) => (
                  <li
                    key={week.weekStart}
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <span className="num text-muted-foreground">{week.label}</span>
                    <span className="num">{week.free}</span>
                  </li>
                ))}
              </ul>
              {canEdit ? (
                <div className="col-span-full">
                  <Link
                    to={allocateHref(params, row.employee.id, list)}
                    preventScrollReset
                    aria-label={`Allocate ${row.employee.fullName} for ${period}`}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className: 'max-sm:h-11',
                    })}
                  >
                    Allocate
                  </Link>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 flex flex-col items-start gap-2.5 rounded-lg border border-dashed border-border p-5">
          <p role="status">{nobodyText(minHours, weeks)}</p>
          <p className="text-xs text-muted-foreground">Try fewer hours or add weeks.</p>
          <div className="flex flex-wrap gap-2">
            {minHours > 0 ? (
              <Link
                to={boardHref(params, { free: { weeks: free.weeks, minFreeHours: String(lower) } })}
                preventScrollReset
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Show {lower}h or more
              </Link>
            ) : null}
            {weeks < MAX_WEEKS ? (
              <Link
                to={boardHref(params, {
                  free: { weeks: String(wider), minFreeHours: free.minFreeHours },
                })}
                preventScrollReset
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Look {wider} weeks ahead
              </Link>
            ) : null}
          </div>
        </div>
      )}
      {list.incompleteRecords.length > 0 ? (
        <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
          Left out — capacity unknown:{' '}
          {list.incompleteRecords.map((employee) => employee.fullName).join(', ')}
        </p>
      ) : null}
    </>
  );
}
