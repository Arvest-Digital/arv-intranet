import type { EmployeeRecord, Team } from '@arv/contracts/org';
import { CalendarIcon, CircleAlertIcon, InfoIcon, UserIcon } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { cn } from '~/shared/lib/utils';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import {
  type EmployeeRecordActionResult,
  type FieldErrors,
  hoursOf,
  type Login,
  loginName,
  NONE,
  type OverbookedWeek,
  WEEKDAYS,
  weekLabel,
  workingDaysText,
} from '../employee-record';

/** Monday to Friday: a new record's working days unless changed (AC-06). */
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

/**
 * «New employee record» (no `record`) or «Edit employee record»: the form, then — when the save
 * would overbook weeks — the list to confirm (AC-19c). Mounted inside the dialog's popup, so a
 * reopened dialog starts clean.
 */
export function EmployeeRecordDialog({
  record,
  teams,
  logins,
  open,
  onOpenChange,
  onSaved,
}: {
  record?: EmployeeRecord;
  teams: ReadonlyArray<Team>;
  /** null when the signed-in user may not read the access list: the link can't be changed here. */
  logins: ReadonlyArray<Login> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (result: Extract<EmployeeRecordActionResult, { ok: true }>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[560px]">
        <RecordDialogBody
          record={record}
          teams={teams}
          logins={logins}
          onDone={(result) => {
            onOpenChange(false);
            onSaved?.(result);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function RecordDialogBody({
  record: opened,
  teams,
  logins,
  onDone,
}: {
  record?: EmployeeRecord;
  teams: ReadonlyArray<Team>;
  logins: ReadonlyArray<Login> | null;
  onDone: (result: Extract<EmployeeRecordActionResult, { ok: true }>) => void;
}) {
  const fetcher = useFetcher<EmployeeRecordActionResult>();
  // The record the form edits: the one opened, or the values someone else saved meanwhile.
  const [record, setRecord] = useState(opened);
  const [formKey, setFormKey] = useState(0);
  const [view, setView] = useState<'form' | 'confirm'>('form');
  const lastSubmit = useRef<FormData | null>(null);
  // Typed values the confirm view describes («40h → 24h»).
  const [submittedHours, setSubmittedHours] = useState('');

  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per answer, not per render
  useEffect(() => {
    if (result?.ok) onDone(result);
    else if (result?.kind === 'confirm') setView('confirm');
  }, [result]);

  const failure = result && !result.ok ? result : null;
  const fieldErrors: FieldErrors = failure?.kind === 'invalid' ? failure.fieldErrors : {};
  const alertError =
    failure?.kind === 'invalid'
      ? (failure.error ?? null)
      : failure?.kind === 'error'
        ? failure.error
        : null;
  const submitting = fetcher.state !== 'idle';

  const saveAnyway = () => {
    if (!lastSubmit.current) return;
    const form = new FormData();
    for (const [key, value] of lastSubmit.current) form.append(key, value);
    form.set('confirm', 'true');
    fetcher.submit(form, { method: 'post' });
  };

  return (
    <>
      <fetcher.Form
        key={formKey}
        method="post"
        hidden={view !== 'form'}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          const form = new FormData(event.currentTarget);
          lastSubmit.current = form;
          setSubmittedHours(String(form.get('contractHours') ?? ''));
        }}
      >
        <DialogHeader>
          <DialogTitle>{record ? 'Edit employee record' : 'New employee record'}</DialogTitle>
          <DialogDescription>
            {record ? record.fullName : 'Adds a resource to the schedule.'}
          </DialogDescription>
        </DialogHeader>
        <input type="hidden" name="intent" value={record ? 'update' : 'create'} />
        {record ? (
          <>
            <input type="hidden" name="employeeRecordId" value={record.id} />
            <input type="hidden" name="version" value={record.version} />
          </>
        ) : null}
        {failure?.kind === 'conflict' && record?.version !== failure.current.version ? (
          <ConflictNotice
            message={failure.error}
            current={failure.current}
            teams={teams}
            onUseCurrent={() => {
              setRecord(failure.current);
              setFormKey((key) => key + 1);
            }}
          />
        ) : null}
        {alertError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <p>{alertError}</p>
          </Alert>
        ) : null}
        <RecordFields record={record} teams={teams} logins={logins} errors={fieldErrors} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : record ? 'Save changes' : 'Create record'}
          </Button>
        </DialogFooter>
      </fetcher.Form>
      {view === 'confirm' && failure?.kind === 'confirm' ? (
        <ConfirmOverbooking
          weeks={failure.weeks}
          description={impactDescription(record, submittedHours)}
          submitting={submitting}
          onBack={() => setView('form')}
          onConfirm={saveAnyway}
        />
      ) : null}
    </>
  );
}

/** «Olena Kovalenko · contract hours 40h → 24h per week» when the hours changed. */
function impactDescription(record: EmployeeRecord | undefined, hours: string) {
  if (!record) return undefined;
  const before = record.contractMinutes === null ? null : hoursOf(record.contractMinutes);
  const after = hours.trim() === '' ? null : String(Number(hours));
  if (before === null || after === null || before === after) return record.fullName;
  return `${record.fullName} · contract hours ${before}h → ${after}h per week`;
}

/** The form's inputs, with each rule error under its field (AC-20, AC-19b). */
function RecordFields({
  record,
  teams,
  logins,
  errors,
}: {
  record?: EmployeeRecord;
  teams: ReadonlyArray<Team>;
  logins: ReadonlyArray<Login> | null;
  errors: FieldErrors;
}) {
  const [hours, setHours] = useState(
    record?.contractMinutes == null ? '' : hoursOf(record.contractMinutes),
  );
  const [days, setDays] = useState<ReadonlyArray<number>>(record?.workingDays ?? DEFAULT_DAYS);
  const teamItems = [
    { value: NONE, label: 'No team' },
    ...teams.map((team) => ({ value: team.id, label: team.name })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Field label="Full name" error={errors.fullName}>
        {(props) => (
          <Input
            {...props}
            name="fullName"
            required
            maxLength={200}
            autoComplete="off"
            defaultValue={record?.fullName}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Field label="Team" optional error={errors.teamId}>
          {(props) => (
            <Select name="teamId" items={teamItems} defaultValue={record?.team?.id ?? NONE}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teamItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Contract hours per week" error={errors.contractHours}>
          {(props) => (
            <div className="flex items-center gap-2">
              <Input
                {...props}
                name="contractHours"
                type="number"
                inputMode="decimal"
                min={0}
                max={60}
                step={0.25}
                className="num w-24 text-right"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
              <span className="text-muted-foreground">h</span>
            </div>
          )}
        </Field>
      </div>
      <WorkingDaysField days={days} onChange={setDays} error={errors.workingDays} />
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Field label="Employment start" error={errors.employmentStart}>
          {(props) => (
            <DateInput {...props} name="employmentStart" defaultValue={record?.employmentStart} />
          )}
        </Field>
        <Field label="Employment end" optional error={errors.employmentEnd}>
          {(props) => (
            <DateInput
              {...props}
              name="employmentEnd"
              placeholder="No end date"
              defaultValue={record?.employmentEnd}
            />
          )}
        </Field>
      </div>
      <LoginField record={record} logins={logins} error={errors.userId} />
      <CapacityPreview hours={hours} days={days} />
    </div>
  );
}

type ControlProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
};

/** A label over its control, with the rule error or a hint under it. */
function Field({
  label,
  optional = false,
  hint,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error ?? hint);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true } : {}),
        ...(hasMessage ? { 'aria-describedby': messageId } : {}),
      })}
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
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
  if (hint) {
    return (
      <p id={id} className="text-xs text-muted-foreground">
        {hint}
      </p>
    );
  }
  return null;
}

function DateInput({
  defaultValue,
  ...props
}: ControlProps & { name: string; placeholder?: string; defaultValue?: string | null }) {
  return (
    <div className="relative">
      <CalendarIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input {...props} type="date" className="num pl-8" defaultValue={defaultValue ?? ''} />
    </div>
  );
}

/** Mon … Sun toggles; posted as repeated `workingDay` fields (ISO weekday numbers). */
function WorkingDaysField({
  days,
  onChange,
  error,
}: {
  days: ReadonlyArray<number>;
  onChange: (days: ReadonlyArray<number>) => void;
  error?: string;
}) {
  const id = useId();
  const toggle = (day: number) =>
    onChange(
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b),
    );
  return (
    <fieldset
      aria-describedby={error ? `${id}-message` : undefined}
      className="flex min-w-0 flex-col gap-2"
    >
      <legend className="mb-2 font-medium">Working days</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map(({ day, short }) => {
          const on = days.includes(day);
          return (
            <Button
              key={day}
              type="button"
              variant={on ? 'default' : 'outline'}
              aria-pressed={on}
              className={cn('h-8 w-11 px-0', error && !on && 'border-destructive')}
              onClick={() => toggle(day)}
            >
              {short}
            </Button>
          );
        })}
      </div>
      {days.map((day) => (
        <input key={day} type="hidden" name="workingDay" value={day} />
      ))}
      <FieldMessage id={`${id}-message`} error={error} />
    </fieldset>
  );
}

/** The linked intranet login: one login belongs to one record (AC-19b). */
function LoginField({
  record,
  logins,
  error,
}: {
  record?: EmployeeRecord;
  logins: ReadonlyArray<Login> | null;
  error?: string;
}) {
  if (logins === null) {
    return (
      <Field
        label="Linked intranet login"
        error={error}
        hint="Choosing a login needs the manage-access permission."
      >
        {(props) => (
          <Input {...props} disabled value={record?.userId ? 'Linked' : 'Not linked'} readOnly />
        )}
      </Field>
    );
  }
  const items = [
    { value: NONE, label: 'Not linked' },
    ...logins.map((login) => ({ value: login.id, label: `${login.name} · ${loginName(login)}` })),
  ];
  return (
    <Field label="Linked intranet login" error={error} hint="Intranet accounts on the access list.">
      {(props) => (
        <Select name="userId" items={items} defaultValue={record?.userId ?? NONE}>
          <SelectTrigger {...props} className="w-full">
            <UserIcon aria-hidden="true" className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

/** «Capacity: 8h per working day · 24h per full week», live as hours and days change (AC-19). */
function CapacityPreview({ hours, days }: { hours: string; days: ReadonlyArray<number> }) {
  const weekly = Number(hours);
  const valid = hours.trim() !== '' && weekly > 0 && weekly <= 60 && days.length > 0;
  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-3 py-2.5 text-[13px]"
    >
      {valid ? (
        <>
          <span>Capacity:</span>
          <span className="num font-medium">{hoursOf((weekly * 60) / days.length)}h</span>
          <span className="text-muted-foreground">per working day ·</span>
          <span className="num font-medium">{hoursOf(weekly * 60)}h</span>
          <span className="text-muted-foreground">per full week</span>
        </>
      ) : hours.trim() === '' ? (
        <span className="text-muted-foreground">
          Without contract hours the record stays incomplete.
        </span>
      ) : (
        <span className="text-muted-foreground">
          Fix contract hours and working days to see capacity.
        </span>
      )}
    </div>
  );
}

/** «These weeks will become overbooked»: nothing is saved until the user confirms (AC-19c). */
function ConfirmOverbooking({
  weeks,
  description,
  submitting,
  onBack,
  onConfirm,
}: {
  weeks: ReadonlyArray<OverbookedWeek>;
  description?: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>These weeks will become overbooked</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      <div className="overflow-hidden rounded-lg border border-border">
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
          {submitting ? 'Saving…' : 'Save anyway'}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Someone saved the record meanwhile: their values, and a way to edit on top of them. */
function ConflictNotice({
  message,
  current,
  teams,
  onUseCurrent,
}: {
  message: string;
  current: EmployeeRecord;
  teams: ReadonlyArray<Team>;
  onUseCurrent: () => void;
}) {
  const team = current.team?.name ?? teams.find((t) => t.id === current.team?.id)?.name;
  const rows: ReadonlyArray<[string, string]> = [
    ['Full name', current.fullName],
    ['Team', team ?? 'No team'],
    [
      'Contract hours',
      current.contractMinutes === null ? '—' : `${hoursOf(current.contractMinutes)}h per week`,
    ],
    ['Working days', workingDaysText(current.workingDays)],
    ['Employment', `${current.employmentStart ?? '—'} – ${current.employmentEnd ?? 'present'}`],
  ];
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <p className="font-medium">{message}. Their values:</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-foreground">
          {rows.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <Button variant="outline" size="sm" className="w-fit" onClick={onUseCurrent}>
          Edit their version
        </Button>
      </div>
    </Alert>
  );
}
