import type { Project } from '@arv/contracts/projects';
import { CalendarIcon, CircleAlertIcon, InfoIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
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
import {
  allocations,
  type ClosingRow,
  dateText,
  isIsoDate,
  longDateText,
  PROJECT_MESSAGE,
  type ProjectActionResult,
  shortDateText,
} from '../project';
import { FieldMessage } from './field-message';

/**
 * «Close project» (critical flow 2, AC-25): the close date, then — when allocations run past it —
 * the ones that end on it and the ones removed, saved only once confirmed with `confirm: true`.
 */
export function ProjectCloseDialog({
  project,
  today,
  onOpenChange,
  onClosed,
}: {
  /** The project being closed; null keeps the dialog shut. */
  project: Project | null;
  /** The earliest close date (YYYY-MM-DD). */
  today: string;
  onOpenChange: (open: boolean) => void;
  onClosed?: (projectId: string, closeDate: string) => void;
}) {
  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[560px]">
        {project ? (
          <ProjectCloseBody
            project={project}
            today={today}
            onDone={(closeDate) => {
              onClosed?.(project.id, closeDate);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProjectCloseBody({
  project,
  today,
  onDone,
}: {
  project: Project;
  today: string;
  onDone: (closeDate: string) => void;
}) {
  const fetcher = useFetcher<ProjectActionResult>();
  const [view, setView] = useState<'date' | 'preview'>('date');
  const [closeDate, setCloseDate] = useState('');
  const id = useId();

  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per answer, not per render
  useEffect(() => {
    if (result?.ok && result.intent === 'close') onDone(result.closeDate);
    else if (result?.ok === false && result.kind === 'confirm') setView('preview');
  }, [result]);

  const failure = result && !result.ok ? result : null;
  // Checked here too, so the date never reaches the api when it is plainly in the past.
  const inPast = isIsoDate(closeDate) && closeDate < today;
  const dateError =
    (inPast ? PROJECT_MESSAGE.closeDateInPast : undefined) ??
    (failure?.kind === 'invalid' ? failure.fieldErrors.closeDate : undefined);
  const alertError = failure?.kind === 'error' ? failure.error : null;
  const submitting = fetcher.state !== 'idle';

  const send = (confirm: boolean) =>
    fetcher.submit(
      {
        intent: 'close',
        projectId: project.id,
        closeDate,
        ...(confirm ? { confirm: 'true' } : {}),
      },
      { method: 'post' },
    );

  const dateId = `${id}-date`;

  return (
    <>
      <form
        hidden={view !== 'date'}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!inPast) send(false);
        }}
      >
        <DialogHeader>
          <DialogTitle>Close {project.name}</DialogTitle>
          <DialogDescription>
            After the close date nobody can be allocated to this project.
          </DialogDescription>
        </DialogHeader>
        {alertError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <p>{alertError}</p>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-2">
          <label htmlFor={dateId} className="font-medium">
            Close date
          </label>
          <div className="relative">
            <CalendarIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={dateId}
              name="closeDate"
              type="date"
              required
              min={today}
              className="num pl-8"
              value={closeDate}
              onChange={(event) => setCloseDate(event.target.value)}
              aria-describedby={`${dateId}-message`}
              {...(dateError ? { 'aria-invalid': true } : {})}
            />
          </div>
          <FieldMessage
            id={`${dateId}-message`}
            error={dateError}
            hint={`The last bookable day: today (${dateText(today)}) or later.`}
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={submitting || inPast || !isIsoDate(closeDate)}>
            {submitting && view === 'date' ? 'Checking…' : 'Review changes'}
          </Button>
        </DialogFooter>
      </form>
      {view === 'preview' && failure?.kind === 'confirm' ? (
        <ClosePreview
          projectName={project.name}
          closeDate={failure.closeDate}
          ending={failure.ending}
          removed={failure.removed}
          submitting={submitting}
          onBack={() => setView('date')}
          onConfirm={() => send(true)}
        />
      ) : null}
    </>
  );
}

/** The allocations the close trims to the close date and those it removes (AC-25). */
function ClosePreview({
  projectName,
  closeDate,
  ending,
  removed,
  submitting,
  onBack,
  onConfirm,
}: {
  projectName: string;
  closeDate: string;
  ending: ReadonlyArray<ClosingRow>;
  removed: ReadonlyArray<ClosingRow>;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Review the close" className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          Close {projectName} on {dateText(closeDate)}
        </DialogTitle>
        <DialogDescription>Review what changes before closing.</DialogDescription>
      </DialogHeader>
      {ending.length > 0 ? (
        <ImpactTable
          title={`${allocations(ending.length)} end on ${shortDateText(closeDate)}`}
          columns={['Resource', 'Current dates', 'New end']}
          rows={ending.map((row) => [
            row.employeeName,
            `${row.startsOn} – ${row.endsOn}`,
            closeDate,
          ])}
          keys={ending.map((row) => row.allocationId)}
        />
      ) : null}
      {removed.length > 0 ? (
        <ImpactTable
          title={`${allocations(removed.length)} start after it and ${removed.length === 1 ? 'is' : 'are'} removed`}
          columns={['Resource', 'Dates', 'Change']}
          rows={removed.map((row) => [
            row.employeeName,
            `${row.startsOn} – ${row.endsOn}`,
            'Removed',
          ])}
          keys={removed.map((row) => row.allocationId)}
        />
      ) : null}
      <Alert role="note" className="bg-muted">
        <InfoIcon aria-hidden="true" />
        <p>
          Changes are recorded in each allocation’s history under your name. The project stays open
          until the end of {longDateText(closeDate)}.
        </p>
      </Alert>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Closing…' : 'Close project'}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ImpactTable({
  title,
  columns,
  rows,
  keys,
}: {
  title: string;
  columns: readonly [string, string, string];
  rows: ReadonlyArray<readonly [string, string, string]>;
  keys: ReadonlyArray<string>;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="font-medium">{title}</h3>
      <div className="max-h-60 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([name, dates, change], i) => (
              <TableRow key={keys[i]}>
                <TableCell>{name}</TableCell>
                <TableCell className="num">{dates}</TableCell>
                <TableCell className={change === 'Removed' ? undefined : 'num'}>{change}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
