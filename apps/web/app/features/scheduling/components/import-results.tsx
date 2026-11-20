import type { ImportPreview, ImportResult } from '@arv/contracts/scheduling';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  FileSpreadsheetIcon,
  LockIcon,
  UploadIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '~/shared/ui/alert';
import { Button, buttonVariants } from '~/shared/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import { firstName, longDate } from '../allocation';
import { dayMonth, hours, isoWeek } from '../board';
import { fileSize, PROBLEM_LABEL, type ProblemRow, permissionNames, plural } from '../import';

/** The chosen file: its name and size, and what was found in it. */
export function FileRow({
  file,
  note,
  children,
}: {
  file: File;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex max-w-[720px] items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
      <FileSpreadsheetIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 grow truncate">
        <span className="font-medium">{file.name}</span>{' '}
        <span className="num text-muted-foreground">
          · {fileSize(file.size)}
          {note ? ` · ${note}` : ''}
        </span>
      </span>
      {children}
    </div>
  );
}

/** One figure the import will create or created. */
function Figure({ value, label, sub }: { value: number; label: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3.5">
      <div className="num text-2xl font-semibold">{value}</div>
      <div className="text-[13px] leading-5">{label}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

const figuresClass = 'grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3';

/**
 * AC-30: a clean file, nothing saved yet — what «Import everything» would create, the records
 * still incomplete after it and the resource-weeks it overbooks (allowed, for information).
 */
export function ImportPreviewView({
  file,
  preview,
  submitting,
  onConfirm,
  onChooseAnother,
}: {
  file: File;
  preview: ImportPreview;
  submitting: boolean;
  onConfirm: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <div className="flex flex-col">
      <FileRow file={file} note="checked · no problems">
        <Button variant="ghost" size="sm" onClick={onChooseAnother}>
          Choose another file
        </Button>
      </FileRow>
      <section aria-label="What the import will create" className={`mt-5 ${figuresClass}`}>
        <Figure value={preview.employeeRecordsToCreate} label="Employee records to create" />
        <Figure
          value={preview.incompleteRecords}
          label="Still incomplete after import"
          sub="Finish them on People after the import."
        />
        <Figure value={preview.projectsToCreate} label="Projects to create" />
        <Figure value={preview.allocationsToCreate} label="Allocations to create" />
      </section>
      {preview.overbookedWeeks.length > 0 ? (
        <section aria-labelledby="import-over" className="mt-6">
          <h2 id="import-over" className="font-semibold">
            Weeks that will be overbooked
          </h2>
          <p className="mt-1 mb-2 text-xs text-muted-foreground">
            Allowed. Shown for information; they will appear in red on the board.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Resource</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">Over</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.overbookedWeeks.map((week) => (
                  <TableRow key={`${week.fullName}|${week.weekStart}`}>
                    <TableCell>{week.fullName}</TableCell>
                    <TableCell className="num">
                      W{isoWeek(week.weekStart)} · {dayMonth(week.weekStart)}
                    </TableCell>
                    <TableCell className="num text-right font-medium text-overload">
                      +{hours(week.overMinutes)}h
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={onConfirm} disabled={submitting}>
          <UploadIcon aria-hidden="true" />
          {submitting ? 'Importing…' : 'Import everything'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Nothing is saved until you confirm. Import everything uploads the same file again and
          saves it in one step.
        </span>
      </div>
    </div>
  );
}

/** AC-31: nothing was imported; every row to fix, with why. */
export function ImportProblems({
  file,
  rows,
  onUploadAgain,
}: {
  file: File;
  rows: ReadonlyArray<ProblemRow>;
  onUploadAgain: () => void;
}) {
  const count = new Set(rows.map((r) => r.row)).size;
  return (
    <div className="flex flex-col">
      <FileRow file={file} note={`${plural(count, 'row needs', 'rows need')} fixing`} />
      <Alert variant="destructive" className="mt-4 max-w-[720px]">
        <CircleAlertIcon aria-hidden="true" />
        <p>
          <span className="font-semibold">Nothing was imported.</span>{' '}
          {plural(count, 'row needs', 'rows need')} fixing before anything can be imported.
        </p>
      </Alert>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <Table aria-label="Problem rows">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16 text-right">Row</TableHead>
              <TableHead>Problem</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.row}|${r.reason}|${r.message}`}>
                <TableCell className="num text-right">{r.row}</TableCell>
                <TableCell>{PROBLEM_LABEL[r.reason]}</TableCell>
                <TableCell className="whitespace-normal">{r.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-5">
        <Button onClick={onUploadAgain}>
          <UploadIcon aria-hidden="true" />
          Fix the spreadsheet and upload again
        </Button>
      </div>
    </div>
  );
}

/** The day a run happened, as the page names it: «2 Dec 2026». */
const runDay = (at: Date) => longDate(at.toISOString().slice(0, 10));

/** AC-32: the import has run; what it created stays on record here. */
export function ImportCompleted({
  run,
  completedAt,
}: {
  run: ImportResult | null;
  /** From a refused upload, when the status has no run to show. */
  completedAt: Date | null;
}) {
  const at = run?.createdAt ?? completedAt;
  const headline = run
    ? `The import was completed on ${runDay(run.createdAt)} by ${firstName(run.importedBy.name)}.`
    : at
      ? `The import was completed on ${runDay(at)}.`
      : 'The import was completed.';
  return (
    <div className="flex max-w-[880px] flex-col">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
        >
          <CircleCheckIcon className="size-5" />
        </span>
        <div>
          <p className="font-semibold">{headline}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            It runs once; this page keeps the record of what was created.
          </p>
        </div>
      </div>
      {run ? (
        <section aria-label="Created by the import" className={`mt-4 ${figuresClass}`}>
          <Figure value={run.employeeRecordsCreated} label="Employee records created" />
          <Figure value={run.projectsCreated} label="Projects created" />
          <Figure value={run.allocationsCreated} label="Allocations created" />
        </section>
      ) : null}
      <p className="mt-5">
        Further changes are made on the board.{' '}
        <Link to="/schedule" className="font-medium underline underline-offset-3">
          Open the board
        </Link>
      </p>
    </div>
  );
}

/** A centred one-message state: the import finished just now, or it can't be offered. */
function CentredState({
  icon,
  role,
  children,
}: {
  icon: React.ReactNode;
  role?: 'status';
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[440px] place-items-center">
      <div role={role} className="flex max-w-[360px] flex-col items-center gap-3 px-4 text-center">
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground [&>svg]:size-5"
        >
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

/** AC-30: confirmed and saved. */
export function ImportSuccess({ run }: { run: ImportResult }) {
  return (
    <CentredState role="status" icon={<CircleCheckIcon />}>
      <p>
        <span className="font-semibold">Import complete.</span> Created{' '}
        {plural(run.employeeRecordsCreated, 'employee record', 'employee records')},{' '}
        {plural(run.projectsCreated, 'project', 'projects')} and{' '}
        {plural(run.allocationsCreated, 'allocation', 'allocations')}. From now on, make changes on
        the board.
      </p>
      <Link to="/schedule" className={buttonVariants()}>
        Open the board
      </Link>
    </CentredState>
  );
}

/** AC-33: names every import permission the user lacks. */
export function ImportPermissionsMissing({ missing }: { missing: ReadonlyArray<string> }) {
  return (
    <CentredState icon={<LockIcon />}>
      <p>
        {missing.length > 0
          ? `You need these permissions to import: ${permissionNames(missing)}.`
          : 'You lack the permissions to import.'}
      </p>
      <p className="text-xs text-muted-foreground">Ask an admin to grant them.</p>
    </CentredState>
  );
}
