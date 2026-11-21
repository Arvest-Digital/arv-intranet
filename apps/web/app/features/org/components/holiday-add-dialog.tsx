import { CalendarIcon, CircleAlertIcon, InfoIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/shared/ui/dialog';
import { Input } from '~/shared/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import { hoursOf, type OverbookedWeek, weekLabel } from '../employee-record';
import { type HolidayActionResult, isIsoDate, longDateText } from '../holiday';

/**
 * «Add holiday»: date and name, then — when the holiday would overbook weeks — the list to confirm
 * (AC-27, AC-19c). Mounted inside the dialog's popup, so a reopened dialog starts clean.
 */
export function HolidayAddDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (holidayDate: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[480px]">
        <HolidayAddBody
          onDone={(holidayDate) => {
            onAdded?.(holidayDate);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function HolidayAddBody({ onDone }: { onDone: (holidayDate: string) => void }) {
  const fetcher = useFetcher<HolidayActionResult>();
  const [view, setView] = useState<'form' | 'confirm'>('form');
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const lastSubmit = useRef<FormData | null>(null);
  const id = useId();

  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per answer, not per render
  useEffect(() => {
    if (result?.ok) onDone(result.holidayDate ?? date);
    else if (result?.kind === 'confirm') setView('confirm');
  }, [result]);

  const failure = result && !result.ok ? result : null;
  const fieldErrors = failure?.kind === 'invalid' ? failure.fieldErrors : {};
  const alertError =
    failure?.kind === 'error' ? failure.error : failure?.kind === 'invalid' ? failure.error : null;
  const submitting = fetcher.state !== 'idle';

  const addAnyway = () => {
    if (!lastSubmit.current) return;
    const form = new FormData();
    for (const [key, value] of lastSubmit.current) form.append(key, value);
    form.set('confirm', 'true');
    fetcher.submit(form, { method: 'post' });
  };

  const dateId = `${id}-date`;
  const nameId = `${id}-name`;
  const dateHint = isIsoDate(date) ? longDateText(date) : 'The day the office is closed.';

  return (
    <>
      <fetcher.Form
        method="post"
        hidden={view !== 'form'}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          lastSubmit.current = new FormData(event.currentTarget);
        }}
      >
        <DialogHeader>
          <DialogTitle>Add holiday</DialogTitle>
          <DialogDescription>
            Applies to everyone who would work that day. Weekly capacity drops by one working day.
          </DialogDescription>
        </DialogHeader>
        <input type="hidden" name="intent" value="add" />
        {alertError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <p>{alertError}</p>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-2">
          <label htmlFor={dateId} className="font-medium">
            Date
          </label>
          <div className="relative">
            <CalendarIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={dateId}
              name="holidayDate"
              type="date"
              required
              className="num pl-8"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-describedby={`${dateId}-message`}
              {...(fieldErrors.holidayDate ? { 'aria-invalid': true } : {})}
            />
          </div>
          <FieldMessage id={`${dateId}-message`} error={fieldErrors.holidayDate} hint={dateHint} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="font-medium">
            Name
          </label>
          <Input
            id={nameId}
            name="name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            {...(fieldErrors.name
              ? { 'aria-invalid': true, 'aria-describedby': `${nameId}-message` }
              : {})}
          />
          <FieldMessage id={`${nameId}-message`} error={fieldErrors.name} />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add holiday'}
          </Button>
        </DialogFooter>
      </fetcher.Form>
      {view === 'confirm' && failure?.kind === 'confirm' ? (
        <ConfirmHolidayImpact
          weeks={failure.weeks}
          holidayDate={String(lastSubmit.current?.get('holidayDate') ?? date)}
          holidayName={String(lastSubmit.current?.get('name') ?? name).trim()}
          submitting={submitting}
          onBack={() => setView('form')}
          onConfirm={addAnyway}
        />
      ) : null}
    </>
  );
}

/** «Adding 25 Dec makes 3 weeks overbooked»: nothing is saved until the user confirms (AC-27). */
function ConfirmHolidayImpact({
  weeks,
  holidayDate,
  holidayName,
  submitting,
  onBack,
  onConfirm,
}: {
  weeks: ReadonlyArray<OverbookedWeek>;
  holidayDate: string;
  holidayName: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const day = isIsoDate(holidayDate) ? longDateText(holidayDate) : holidayDate;
  const short = day.split(' ').slice(1, 3).join(' ');
  return (
    <div role="alertdialog" aria-label="Confirm the holiday" className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          Adding {short} makes {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} overbooked
        </DialogTitle>
        <DialogDescription>
          {holidayName} · {day} lowers capacity for everyone who works that day.
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-80 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Resource</TableHead>
              <TableHead>Week</TableHead>
              <TableHead className="text-right">Over</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weeks.map((week) => (
              <TableRow key={`${week.employeeName}-${week.weekStart}`}>
                <TableCell>{week.employeeName}</TableCell>
                <TableCell className="num">{weekLabel(week.weekStart)}</TableCell>
                <TableCell className="num text-right font-medium text-overload">
                  +{hoursOf(week.overMinutes)}h
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Alert role="note" className="bg-muted">
        <InfoIcon aria-hidden="true" />
        <p>Allocations are not changed.</p>
      </Alert>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Adding…' : 'Add anyway'}
        </Button>
      </DialogFooter>
    </div>
  );
}

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p
        id={id}
        role="alert"
        className="flex items-start gap-1.5 text-xs font-medium text-destructive"
      >
        <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        {error}
      </p>
    );
  }
  if (!hint) return null;
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {hint}
    </p>
  );
}
