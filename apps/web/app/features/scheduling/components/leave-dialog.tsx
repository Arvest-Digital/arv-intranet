import { CircleAlertIcon, InfoIcon, PlaneIcon } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import {
  ALLOCATION_MESSAGE,
  type AllocationActionResult,
  type AllocationField,
  dateErrors,
  type FieldErrors,
  firstName,
  type OnLeave,
  type OverWeek,
} from '../allocation';
import { addDays, dayMonth, type FilterOption, hours, isIsoDate, isoWeek } from '../board';
import {
  ALLOCATION_ACTION,
  DateInput,
  FieldShell,
  ProjectSwatch,
  type Resource,
} from './allocation-dialog';
import { Avatar } from './board-grid';

/** «Book leave» is open, for this person when one is chosen already. */
export type LeaveDialogState = { readonly employeeId: string | null };

/**
 * Book leave (US-04, critical flow 6): a person, a leave type — an open leave-type project — and
 * whole days; there is no hours input, each working day takes the full daily capacity (AC-15).
 * The booking goes once without `confirm`: work on the leave days answers with those allocations
 * named and the weeks they overbook, and «Book anyway» resends with `confirm` (AC-15, ADR-0010).
 * Broken rules sit under their fields (AC-09, AC-13).
 */
export function LeaveDialog({
  state,
  resources,
  projects,
  today,
  onOpenChange,
  onDone,
}: {
  state: LeaveDialogState | null;
  resources: ReadonlyArray<Resource>;
  /** Every project the viewer may see; only open leave projects are offered. */
  projects: ReadonlyArray<FilterOption>;
  today: string;
  onOpenChange: (open: boolean) => void;
  /** After the booking: what to tell the user. */
  onDone: (message: string) => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[560px]">
        {state ? (
          <LeaveBody
            state={state}
            resources={resources}
            projects={projects}
            today={today}
            onDone={(message) => {
              onDone(message);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type LeaveField = Exclude<AllocationField, 'rate'>;

type LeaveValues = { employeeId: string; projectId: string; startsOn: string; endsOn: string };

function LeaveBody({
  state,
  resources,
  projects,
  today,
  onDone,
}: {
  state: LeaveDialogState;
  resources: ReadonlyArray<Resource>;
  projects: ReadonlyArray<FilterOption>;
  today: string;
  onDone: (message: string) => void;
}) {
  const fetcher = useFetcher<AllocationActionResult>();
  const leaveTypes = projects.filter((p) => p.type === 'leave' && p.status !== 'closed');
  const [values, setValues] = useState<LeaveValues>(() => ({
    employeeId: state.employeeId ?? '',
    projectId: leaveTypes[0]?.id ?? '',
    startsOn: today,
    endsOn: '',
  }));
  const [view, setView] = useState<'form' | 'confirm'>('form');
  const [checked, setChecked] = useState<FieldErrors | null>(null);
  const id = useId();

  const set = (patch: Partial<LeaveValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setChecked(null);
  };

  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const failure = result && !result.ok ? result : null;
  const submitting = fetcher.state !== 'idle';
  const person = resources.find((r) => r.id === values.employeeId);
  const leaveType = leaveTypes.find((p) => p.id === values.projectId);
  const leaveName = leaveType?.name ?? 'Leave';

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per answer, not per render
  useEffect(() => {
    if (!result) return;
    if (result.ok) {
      onDone(
        `${leaveName} booked for ${person?.fullName ?? 'the person'}: ${rangeText(values.startsOn, values.endsOn)}.`,
      );
    } else setView(result.kind === 'confirm' ? 'confirm' : 'form');
  }, [result]);

  const send = (confirm: boolean) =>
    fetcher.submit(
      {
        intent: 'leave',
        employeeId: values.employeeId,
        projectId: values.projectId,
        startsOn: values.startsOn,
        endsOn: values.endsOn,
        projectName: leaveName,
        ...(confirm ? { confirm: 'true' } : {}),
      },
      { method: 'post', action: ALLOCATION_ACTION },
    );

  /** Plain mistakes are shown before anything is sent (AC-09). */
  const submit = () => {
    const errors: FieldErrors = {
      ...(values.employeeId ? {} : { employeeId: [ALLOCATION_MESSAGE.employee] }),
      ...(values.projectId ? {} : { projectId: [ALLOCATION_MESSAGE.leaveType] }),
      ...dateErrors(values.startsOn, values.endsOn),
    };
    if (Object.keys(errors).length > 0) {
      setChecked(errors);
      return;
    }
    setChecked(null);
    send(false);
  };

  if (view === 'confirm' && failure?.kind === 'confirm') {
    return (
      <LeaveConflictView
        personName={person?.fullName ?? ''}
        leaveName={leaveName}
        startsOn={values.startsOn}
        endsOn={values.endsOn}
        weeks={failure.weeks}
        onLeave={failure.onLeave}
        submitting={submitting}
        onBack={() => setView('form')}
        onConfirm={() => send(true)}
      />
    );
  }

  const errors: FieldErrors =
    checked ?? (failure?.kind === 'invalid' && view === 'form' ? failure.fieldErrors : {});
  const alertError =
    failure?.kind === 'error'
      ? failure.error
      : failure?.kind === 'invalid'
        ? (failure.error ?? null)
        : null;
  const fid = (field: LeaveField) => `${id}-${field}`;
  const describe = (field: LeaveField) => ({
    'aria-describedby': `${fid(field)}-message`,
    ...(errors[field]?.length ? { 'aria-invalid': true } : {}),
  });
  const first = person ? firstName(person.fullName) : null;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Book leave</DialogTitle>
        <DialogDescription>
          Leave is booked in whole working days and takes the full daily capacity.
        </DialogDescription>
      </DialogHeader>
      {alertError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <p>{alertError}</p>
        </Alert>
      ) : null}

      <FieldShell
        label="Resource"
        htmlFor={fid('employeeId')}
        messageId={`${fid('employeeId')}-message`}
        errors={errors.employeeId}
      >
        <Select
          items={resources.map((r) => ({ value: r.id, label: r.fullName }))}
          value={values.employeeId || null}
          onValueChange={(value) => set({ employeeId: String(value ?? '') })}
        >
          <SelectTrigger id={fid('employeeId')} {...describe('employeeId')} className="w-full">
            <SelectValue placeholder="Choose a person" />
          </SelectTrigger>
          <SelectContent>
            {resources.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                <Avatar name={r.fullName} />
                <span className="truncate">{r.fullName}</span>
                <span className="ml-auto text-xs text-muted-foreground">{r.team}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>

      <FieldShell
        label="Leave type"
        htmlFor={fid('projectId')}
        messageId={`${fid('projectId')}-message`}
        errors={errors.projectId}
        hint={leaveTypes.length === 0 ? 'No open leave types to book.' : undefined}
      >
        <Select
          items={leaveTypes.map((p) => ({ value: p.id, label: p.name }))}
          value={values.projectId || null}
          onValueChange={(value) => set({ projectId: String(value ?? '') })}
        >
          <SelectTrigger id={fid('projectId')} {...describe('projectId')} className="w-full">
            <SelectValue placeholder="Choose a leave type" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Leave</SelectLabel>
              {leaveTypes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <ProjectSwatch projectId={undefined} />
                  {p.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </FieldShell>

      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FieldShell
          label="Start"
          htmlFor={fid('startsOn')}
          messageId={`${fid('startsOn')}-message`}
          errors={errors.startsOn}
        >
          <DateInput
            id={fid('startsOn')}
            value={values.startsOn}
            min={today}
            onChange={(startsOn) => set({ startsOn })}
            {...describe('startsOn')}
          />
        </FieldShell>
        <FieldShell
          label="End"
          htmlFor={fid('endsOn')}
          messageId={`${fid('endsOn')}-message`}
          errors={errors.endsOn}
        >
          <DateInput
            id={fid('endsOn')}
            value={values.endsOn}
            min={values.startsOn || today}
            onChange={(endsOn) => set({ endsOn })}
            {...describe('endsOn')}
          />
        </FieldShell>
      </div>

      <LeaveDays startsOn={values.startsOn} endsOn={values.endsOn} />
      <p className="text-xs text-muted-foreground">
        Each leave day takes {first ? `${first}’s` : 'the person’s'} full daily capacity. There is
        no hours input.
      </p>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Booking…' : 'Book leave'}
        </Button>
      </DialogFooter>
    </form>
  );
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Monday 0 … Sunday 6. */
const dayOfWeek = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/** «Wed 23 Dec». */
const dayName = (iso: string) => `${WEEKDAY[dayOfWeek(iso)]} ${dayMonth(iso)}`;

/** «23 Dec – 28 Dec 2026». */
const rangeText = (startsOn: string, endsOn: string) =>
  `${dayMonth(startsOn)} – ${dayMonth(endsOn)} ${endsOn.slice(0, 4)}`;

/** The most days the summary lists one by one. */
const MAX_CHIPS = 10;

/**
 * The weekdays the range covers, and the weekends it skips. Public holidays and the person's
 * working pattern are the api's to apply: the summary says so rather than guess them.
 */
export function leaveDays(startsOn: string, endsOn: string) {
  if (!isIsoDate(startsOn) || !isIsoDate(endsOn) || endsOn < startsOn) return null;
  const weekdays: string[] = [];
  const weekends: Array<{ from: string; to: string }> = [];
  // A year at most: longer ranges are the api's to refuse.
  for (let day = startsOn, n = 0; day <= endsOn && n < 366; day = addDays(day, 1), n += 1) {
    if (dayOfWeek(day) < 5) weekdays.push(day);
    else {
      const last = weekends[weekends.length - 1];
      if (last && addDays(last.to, 1) === day) last.to = day;
      else weekends.push({ from: day, to: day });
    }
  }
  return { weekdays, weekends };
}

function LeaveDays({ startsOn, endsOn }: { startsOn: string; endsOn: string }) {
  const days = leaveDays(startsOn, endsOn);
  if (!days) return null;
  const { weekdays, weekends } = days;
  const more = weekdays.length - MAX_CHIPS;
  return (
    <div aria-live="polite" className="flex flex-col gap-2 rounded-md border border-border p-3">
      <span className="num text-sm font-semibold">
        {weekdays.length} {weekdays.length === 1 ? 'weekday' : 'weekdays'}
      </span>
      {weekdays.length > 0 ? (
        <ul aria-label="Leave days" className="flex flex-wrap gap-1.5">
          {weekdays.slice(0, MAX_CHIPS).map((day) => (
            <li
              key={day}
              className="inline-flex h-6 items-center gap-1 rounded-sm border border-dashed border-ring bg-muted/50 px-2 text-xs font-medium"
            >
              <PlaneIcon aria-hidden="true" className="size-3" />
              {dayName(day)}
            </li>
          ))}
          {more > 0 ? (
            <li className="inline-flex h-6 items-center px-1 text-xs text-muted-foreground">
              +{more} more
            </li>
          ) : null}
        </ul>
      ) : null}
      <ul aria-label="Skipped days" className="text-xs text-muted-foreground">
        {weekends.map((w) => (
          <li key={w.from} className="py-0.5">
            <span className="font-medium text-foreground">Skipped:</span>{' '}
            {w.from === w.to ? dayName(w.from) : `${dayName(w.from)} – ${dayName(w.to)}`} · not a
            working day
          </li>
        ))}
        <li className="py-0.5">
          Public holidays and days off in the working pattern are skipped too.
        </li>
      </ul>
    </div>
  );
}

/**
 * AC-15: the leave days carry work. Names each work allocation and its days, and the weeks it
 * overbooks; booked only once confirmed.
 */
function LeaveConflictView({
  personName,
  leaveName,
  startsOn,
  endsOn,
  weeks,
  onLeave,
  submitting,
  onBack,
  onConfirm,
}: {
  personName: string;
  leaveName: string;
  startsOn: string;
  endsOn: string;
  weeks: ReadonlyArray<OverWeek>;
  onLeave: ReadonlyArray<OnLeave>;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const first = firstName(personName);
  const title =
    onLeave.length > 0
      ? `${first} has work planned on the leave days`
      : `${first} will be overbooked in ${weeks.length} ${weeks.length === 1 ? 'week' : 'weeks'}`;
  const descId = useId();
  const days = leaveDays(startsOn, endsOn);
  return (
    <div
      role="alertdialog"
      aria-label={title}
      aria-describedby={descId}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription id={descId}>
          {leaveName} · {dayName(startsOn)} – {dayName(endsOn)} {endsOn.slice(0, 4)}
          {days
            ? ` · ${days.weekdays.length} ${days.weekdays.length === 1 ? 'weekday' : 'weekdays'}`
            : ''}
        </DialogDescription>
      </DialogHeader>
      {onLeave.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="font-medium">Work on leave days</span>
          <ul
            aria-label="Work on leave days"
            className="divide-y divide-border rounded-md border border-border"
          >
            {onLeave.map((item) => (
              <li
                key={item.projectId}
                className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px] leading-5"
              >
                <ProjectSwatch projectId={item.projectId} />
                <span className="min-w-0">
                  <span className="font-medium">{item.projectName}</span> —{' '}
                  <span className="num">{item.days.map(dayName).join(', ')}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {weeks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="font-medium">Overbooked weeks</span>
          <div className="overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Over</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeks.map((week) => (
                  <TableRow key={week.weekStart}>
                    <TableCell className="num">
                      W{isoWeek(week.weekStart)} · {dayMonth(week.weekStart)}
                    </TableCell>
                    <TableCell className="num text-right">{hours(week.capacityMinutes)}h</TableCell>
                    <TableCell className="num text-right">
                      {hours(week.allocatedMinutes)}h
                    </TableCell>
                    <TableCell className="num text-right font-medium text-overload">
                      +{hours(week.overMinutes)}h
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
      <Alert role="note" className="bg-muted/50">
        <InfoIcon aria-hidden="true" />
        <p>Shorten or move these allocations, or confirm to book anyway.</p>
      </Alert>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Booking…' : 'Book anyway'}
        </Button>
      </DialogFooter>
    </div>
  );
}
