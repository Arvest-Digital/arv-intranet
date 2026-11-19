import type { PublicHoliday } from '@arv/contracts/org';
import { CircleAlertIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useFetcher } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import { type HolidayActionResult, holidayDateText } from '../holiday';

/**
 * One year of the company holiday list (US-09). Holders of manage-holiday-list see «Add holiday»
 * and «Remove»; everyone else reads it (AC-28).
 */
export function HolidayList({
  holidays,
  year,
  years,
  canManage,
  highlightDate,
  onAdd,
}: {
  holidays: ReadonlyArray<PublicHoliday>;
  year: number;
  years: ReadonlyArray<number>;
  canManage: boolean;
  /** The holiday just added. */
  highlightDate?: string;
  onAdd: () => void;
}) {
  const fetcher = useFetcher<HolidayActionResult>();
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const removeError = result && !result.ok && result.kind === 'error' ? result.error : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <YearChoice year={year} years={years} />
        <span className="grow" />
        {canManage ? (
          <Button aria-haspopup="dialog" onClick={onAdd}>
            <PlusIcon aria-hidden="true" />
            Add holiday
          </Button>
        ) : null}
      </div>
      {removeError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <p>{removeError}</p>
        </Alert>
      ) : null}
      {holidays.length === 0 ? (
        <p className="text-muted-foreground">No holidays in {year} yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table aria-label={`Holidays ${year}`}>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-48">Date</TableHead>
                <TableHead>Name</TableHead>
                {canManage ? (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((holiday) => (
                <TableRow
                  key={holiday.id}
                  className={cn(holiday.holidayDate === highlightDate && 'bg-muted/50')}
                >
                  <TableCell className="num">{holidayDateText(holiday.holidayDate)}</TableCell>
                  <TableCell>{holiday.name}</TableCell>
                  {canManage ? (
                    <TableCell className="py-1.5 text-right">
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="publicHolidayId" value={holiday.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Remove ${holiday.name}`}
                          disabled={fetcher.state !== 'idle'}
                        >
                          <Trash2Icon aria-hidden="true" />
                          Remove
                        </Button>
                      </fetcher.Form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {canManage ? null : (
        <p className="text-xs text-muted-foreground">
          Adding and removing holidays needs the manage holiday list permission.
        </p>
      )}
    </div>
  );
}

/** The year shown, as links so it lives in the URL (`?year=2027`). */
function YearChoice({ year, years }: { year: number; years: ReadonlyArray<number> }) {
  return (
    <nav
      aria-label="Year"
      className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-input/50 p-0.5"
    >
      {years.map((choice) => (
        <YearLink key={choice} to={`?year=${choice}`} current={choice === year}>
          {choice}
        </YearLink>
      ))}
    </nav>
  );
}

function YearLink({
  to,
  current,
  children,
}: {
  to: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className="num grid h-6.5 place-items-center rounded-sm px-2.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 aria-[current=page]:bg-secondary aria-[current=page]:text-foreground"
    >
      {children}
    </Link>
  );
}
