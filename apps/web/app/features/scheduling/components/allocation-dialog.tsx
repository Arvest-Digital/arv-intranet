import type { WorkRatePeriod } from '@arv/contracts/scheduling';
import {
  CalendarIcon,
  CircleAlertIcon,
  InfoIcon,
  LockIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useFetcher } from 'react-router';
import { projectColorStyle } from '~/shared/lib/project-color';
import { cn } from '~/shared/lib/utils';
import { PATHS } from '~/shared/paths';
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
  type AllocationTarget,
  type AllocationValues,
  allocationTerms,
  changedAtText,
  dateErrors,
  dayBefore,
  type FieldErrors,
  firstName,
  longDate,
  type OnLeave,
  type OverWeek,
  parseRate,
  rateHours,
  rateText,
} from '../allocation';
import { allocationName, dayMonth, type FilterOption, hours, isoWeek, TYPE_LABEL } from '../board';
import { Avatar } from './board-grid';
import { segClass, segItemClass } from './board-toolbar';

/** Where the dialog's fetcher posts (ADR-0002: edits are route actions). */
export const ALLOCATION_ACTION = PATHS.allocations;

/** A person the create dialog can allocate. */
export type Resource = { readonly id: string; readonly fullName: string; readonly team: string };

/** Which dialog is open, and with what. */
export type AllocationDialogState =
  | {
      readonly mode: 'create';
      readonly employeeId: string | null;
      readonly startsOn: string | null;
      readonly endsOn: string | null;
    }
  | { readonly mode: 'edit'; readonly target: AllocationTarget }
  | { readonly mode: 'remove'; readonly target: AllocationTarget };

const PROJECT_GROUPS = ['client', 'internal', 'bench', 'training'] as const;

/**
 * Create, change and remove an allocation (US-03, critical flow 1). Each save goes once without
 * `confirm`: an overbooking answer lists the weeks over (AC-10) and «Save anyway» resends with
 * `confirm`; a version conflict shows the other user's values (AC-07b); broken rules sit under
 * their fields (AC-09, AC-13); a closed project (AC-11) or a missing permission (AC-12) shows in
 * the dialog and nothing changes. Each body mounts inside the popup, so a reopened dialog starts
 * clean.
 */
export function AllocationDialog({
  state,
  resources,
  projects,
  today,
  onOpenChange,
  onDone,
}: {
  state: AllocationDialogState | null;
  resources: ReadonlyArray<Resource>;
  /** Every project the viewer may see; only open work projects are offered. */
  projects: ReadonlyArray<FilterOption>;
  today: string;
  onOpenChange: (open: boolean) => void;
  /** After a save: what to tell the user. */
  onDone: (message: string) => void;
}) {
  const done = (message: string) => {
    onDone(message);
    onOpenChange(false);
  };
  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[560px]">
        {state?.mode === 'remove' ? (
          <RemoveBody target={state.target} projects={projects} today={today} onDone={done} />
        ) : state ? (
          <FormBody
            state={state}
            resources={resources}
            projects={projects}
            today={today}
            onDone={done}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The closed project an allocation belongs to, if it is closed (AC-11). */
const closedProject = (target: AllocationTarget, projects: ReadonlyArray<FilterOption>) => {
  const id = target.allocation.project?.id;
  const project = id ? projects.find((p) => p.id === id) : undefined;
  return project?.status === 'closed' ? project : null;
};

type FormValues = {
  employeeId: string;
  projectId: string;
  startsOn: string;
  endsOn: string;
  rate: string;
  ratePeriod: WorkRatePeriod;
};

function initialValues(state: Exclude<AllocationDialogState, { mode: 'remove' }>, today: string) {
  if (state.mode === 'create') {
    const start = state.startsOn && state.startsOn > today ? state.startsOn : today;
    return {
      employeeId: state.employeeId ?? '',
      projectId: '',
      startsOn: start,
      endsOn: state.endsOn && state.endsOn >= start ? state.endsOn : '',
      rate: '',
      ratePeriod: 'week',
    } satisfies FormValues;
  }
  const terms = allocationTerms(state.target.allocation, today);
  return {
    employeeId: '',
    projectId: state.target.allocation.project?.id ?? '',
    startsOn: terms.startsOn,
    endsOn: terms.endsOn,
    rate: terms.rateMinutes === null ? '' : rateHours(terms.rateMinutes),
    ratePeriod: terms.ratePeriod === 'day' ? 'day' : 'week',
  } satisfies FormValues;
}

/** «New allocation» and «Edit allocation», then the overbooking and conflict views. */
function FormBody({
  state,
  resources,
  projects,
  today,
  onDone,
}: {
  state: Exclude<AllocationDialogState, { mode: 'remove' }>;
  resources: ReadonlyArray<Resource>;
  projects: ReadonlyArray<FilterOption>;
  today: string;
  onDone: (message: string) => void;
}) {
  const fetcher = useFetcher<AllocationActionResult>();
  const editing = state.mode === 'edit' ? state.target : null;
  const terms = editing ? allocationTerms(editing.allocation, today) : null;
  const [values, setValues] = useState<FormValues>(() => initialValues(state, today));
  const [version, setVersion] = useState(editing?.allocation.version ?? 0);
  const [view, setView] = useState<'form' | 'confirm' | 'conflict'>('form');
  const [checked, setChecked] = useState<FieldErrors | null>(null);
  const id = useId();

  const set = (patch: Partial<FormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setChecked(null);
  };

  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const failure = result && !result.ok ? result : null;
  const submitting = fetcher.state !== 'idle';

  const resource = editing
    ? { fullName: editing.employeeName }
    : resources.find((r) => r.id === values.employeeId);
  const project = editing
    ? editing.allocation.project
    : projects.find((p) => p.id === values.projectId);
  const projectName = project?.name ?? '';
  const closed = editing ? closedProject(editing, projects) : null;
  const startLocked = terms?.started ?? false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per answer, not per render
  useEffect(() => {
    if (!result) return;
    if (result.ok) {
      onDone(
        result.intent === 'create'
          ? `Allocated ${resource?.fullName ?? 'the person'} to ${projectName}.`
          : `Allocation saved for ${resource?.fullName ?? 'the person'} on ${projectName}.`,
      );
    } else if (result.kind === 'confirm') setView('confirm');
    else if (result.kind === 'conflict') setView('conflict');
    else setView('form');
  }, [result]);

  const send = (confirm: boolean, atVersion = version) => {
    const common = {
      endsOn: values.endsOn,
      rate: values.rate,
      ratePeriod: values.ratePeriod,
      projectName,
      ...(confirm ? { confirm: 'true' } : {}),
    };
    fetcher.submit(
      editing
        ? {
            intent: 'change',
            allocationId: editing.allocation.id,
            version: String(atVersion),
            ...(startLocked ? {} : { startsOn: values.startsOn }),
            ...common,
          }
        : {
            intent: 'create',
            employeeId: values.employeeId,
            projectId: values.projectId,
            startsOn: values.startsOn,
            ...common,
          },
      { method: 'post', action: ALLOCATION_ACTION },
    );
  };

  /** Plain mistakes are shown before anything is sent (AC-09). */
  const submit = () => {
    const rate = parseRate(values.rate, values.ratePeriod);
    const dates = dateErrors(startLocked ? values.endsOn : values.startsOn, values.endsOn);
    const errors: FieldErrors = {
      ...(editing || values.employeeId ? {} : { employeeId: [ALLOCATION_MESSAGE.employee] }),
      ...(editing || values.projectId ? {} : { projectId: [ALLOCATION_MESSAGE.project] }),
      ...(startLocked ? { ...(dates.endsOn ? { endsOn: dates.endsOn } : {}) } : dates),
      ...(rate.ok ? {} : { rate: rate.errors }),
    };
    if (Object.keys(errors).length > 0) {
      setChecked(errors);
      return;
    }
    setChecked(null);
    send(false);
  };

  const errors: FieldErrors =
    checked ?? (failure?.kind === 'invalid' && view === 'form' ? failure.fieldErrors : {});
  const alertError =
    view === 'form' && failure
      ? failure.kind === 'error'
        ? failure.error
        : failure.kind === 'invalid'
          ? (failure.error ?? null)
          : null
      : null;

  if (view === 'confirm' && failure?.kind === 'confirm') {
    return (
      <OverbookingView
        personName={resource?.fullName ?? ''}
        projectName={projectName}
        startsOn={startLocked ? today : values.startsOn}
        endsOn={values.endsOn}
        weeks={failure.weeks}
        onLeave={failure.onLeave}
        submitting={submitting}
        onBack={() => setView('form')}
        onConfirm={() => send(true)}
      />
    );
  }

  if (view === 'conflict' && failure?.kind === 'conflict' && editing) {
    return (
      <ConflictView
        personName={editing.employeeName}
        conflict={failure}
        yours={{
          projectName,
          startsOn: values.startsOn,
          endsOn: values.endsOn,
          rateMinutes: parseRate(values.rate, values.ratePeriod).ok
            ? Math.round(Number(values.rate) * 60)
            : null,
          ratePeriod: values.ratePeriod,
        }}
        submitting={submitting}
        onUseCurrent={() => {
          const { current } = failure;
          setVersion(failure.version);
          set({
            startsOn: current.startsOn,
            endsOn: current.endsOn,
            rate: current.rateMinutes === null ? '' : rateHours(current.rateMinutes),
            ratePeriod: current.ratePeriod === 'day' ? 'day' : 'week',
          });
          setView('form');
        }}
        onReapply={() => {
          setVersion(failure.version);
          send(false, failure.version);
        }}
      />
    );
  }

  const fid = (field: AllocationField) => `${id}-${field}`;
  const describe = (field: AllocationField) => ({
    'aria-describedby': `${fid(field)}-message`,
    ...(errors[field]?.length ? { 'aria-invalid': true } : {}),
  });
  const workProjects = projects.filter((p) => p.status !== 'closed' && p.type !== 'leave');
  const banners: ReadonlyArray<{ kind: 'info' | 'error'; text: string }> = [
    ...(closed ? [{ kind: 'error' as const, text: ALLOCATION_MESSAGE.closed(closed.name) }] : []),
    ...(editing?.allocation.needsAttention && editing.employmentEnd
      ? [
          {
            kind: 'error' as const,
            text: `This allocation runs past ${firstName(editing.employeeName)}’s employment end (${longDate(editing.employmentEnd)}). End it by then, or remove it.`,
          },
        ]
      : []),
    ...(startLocked && terms && !closed
      ? [
          {
            kind: 'info' as const,
            text: `Changes apply from today (${dayMonth(today)}). Earlier weeks keep ${rateText(terms.rateMinutes, terms.ratePeriod).replace(' / ', '/')}.`,
          },
        ]
      : []),
  ];

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!closed) submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit allocation' : 'New allocation'}</DialogTitle>
        <DialogDescription>
          {editing && terms
            ? `${editing.employeeName} · ${allocationName(editing.allocation)} · currently ${rateText(terms.rateMinutes, terms.ratePeriod)}`
            : 'Book hours for one person on one open project.'}
        </DialogDescription>
      </DialogHeader>
      {banners.map((banner) => (
        <Alert
          key={banner.text}
          role={banner.kind === 'error' ? 'alert' : 'status'}
          variant={banner.kind === 'error' ? 'destructive' : 'default'}
          className={banner.kind === 'info' ? 'bg-muted/50' : undefined}
        >
          {banner.kind === 'error' ? (
            <CircleAlertIcon aria-hidden="true" />
          ) : (
            <InfoIcon aria-hidden="true" />
          )}
          <p>{banner.text}</p>
        </Alert>
      ))}
      {alertError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <p>{alertError}</p>
        </Alert>
      ) : null}

      {editing ? (
        <>
          <ReadOnlyField label="Resource">
            <Avatar name={editing.employeeName} />
            <span className="truncate">{editing.employeeName}</span>
          </ReadOnlyField>
          <ReadOnlyField label="Project">
            <ProjectSwatch projectId={editing.allocation.project?.id} />
            <span className="truncate">{allocationName(editing.allocation)}</span>
            {editing.allocation.project ? (
              <span className="ml-auto text-xs text-muted-foreground">
                {TYPE_LABEL[editing.allocation.project.type]}
              </span>
            ) : null}
          </ReadOnlyField>
        </>
      ) : (
        <>
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
            label="Project"
            htmlFor={fid('projectId')}
            messageId={`${fid('projectId')}-message`}
            errors={errors.projectId}
            hint="Only open projects are listed. Leave is booked with «Book leave»."
          >
            <Select
              items={workProjects.map((p) => ({ value: p.id, label: p.name }))}
              value={values.projectId || null}
              onValueChange={(value) => set({ projectId: String(value ?? '') })}
            >
              <SelectTrigger id={fid('projectId')} {...describe('projectId')} className="w-full">
                <SelectValue placeholder="Choose an open project" />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_GROUPS.map((type) => {
                  const items = workProjects.filter((p) => p.type === type);
                  return items.length === 0 ? null : (
                    <SelectGroup key={type}>
                      <SelectLabel>{TYPE_LABEL[type]}</SelectLabel>
                      {items.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <ProjectSwatch projectId={p.id} />
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </FieldShell>
        </>
      )}

      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FieldShell
          label="Start"
          htmlFor={fid('startsOn')}
          messageId={`${fid('startsOn')}-message`}
          errors={errors.startsOn}
          hint={
            startLocked
              ? 'Started in the past · can’t be changed'
              : `From today (${longDate(today)})`
          }
        >
          <DateInput
            id={fid('startsOn')}
            value={values.startsOn}
            min={today}
            readOnly={startLocked}
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
            min={startLocked ? today : values.startsOn || today}
            onChange={(endsOn) => set({ endsOn })}
            {...describe('endsOn')}
          />
        </FieldShell>
      </div>

      <FieldShell
        label="Rate"
        htmlFor={fid('rate')}
        messageId={`${fid('rate')}-message`}
        errors={errors.rate}
        hint="Steps of 0.25h · up to 24h per day"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={fid('rate')}
            type="number"
            inputMode="decimal"
            step={0.25}
            min={0.25}
            value={values.rate}
            onChange={(event) => set({ rate: event.target.value })}
            className="num w-24"
            {...describe('rate')}
          />
          <span className="text-[13px] text-muted-foreground">hours</span>
          <fieldset aria-label="Rate unit" className={segClass}>
            {(['day', 'week'] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={values.ratePeriod === unit}
                onClick={() => set({ ratePeriod: unit })}
                className={segItemClass(values.ratePeriod === unit)}
              >
                per {unit}
              </button>
            ))}
          </fieldset>
        </div>
      </FieldShell>

      {editing ? (
        <p className="text-xs text-muted-foreground">
          Last changed by {editing.allocation.lastChangedBy.name} ·{' '}
          {changedAtText(editing.allocation.lastChangedAt)}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting || closed !== null}>
          {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create allocation'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** AC-10: every week the save overbooks, with the hours over; saved only once confirmed. */
function OverbookingView({
  personName,
  projectName,
  startsOn,
  endsOn,
  weeks,
  onLeave,
  submitting,
  onBack,
  onConfirm,
}: {
  personName: string;
  projectName: string;
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
    weeks.length > 0
      ? `${first} will be overbooked in ${weeks.length} ${weeks.length === 1 ? 'week' : 'weeks'}`
      : `${first} has leave in this range`;
  return (
    <div role="alertdialog" aria-label={title} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {projectName} · {startsOn} – {endsOn} puts {personName} over capacity. Go back to change
          the rate or dates, or save anyway.
        </DialogDescription>
      </DialogHeader>
      {weeks.length > 0 ? (
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
                  <TableCell className="num text-right">{hours(week.allocatedMinutes)}h</TableCell>
                  <TableCell className="num text-right font-medium text-overload">
                    +{hours(week.overMinutes)}h
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {onLeave.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px]">
          {onLeave.map((item) => (
            <li key={item.projectName}>
              {item.projectName} has hours on leave days:{' '}
              <span className="num">{item.days.map(dayMonth).join(', ')}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Alert role="note" className="border-overload/35 bg-overload/5">
        <TriangleAlertIcon aria-hidden="true" className="text-overload" />
        <p>Overbooked weeks show in red on the board until hours are moved.</p>
      </Alert>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back to edit
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save anyway'}
        </Button>
      </DialogFooter>
    </div>
  );
}

type Conflict = Extract<AllocationActionResult, { kind: 'conflict' }>;

const COMPARED = [
  ['Project', (v: AllocationValues) => v.projectName],
  ['Start', (v: AllocationValues) => v.startsOn],
  ['End', (v: AllocationValues) => v.endsOn],
  ['Rate', (v: AllocationValues) => rateText(v.rateMinutes, v.ratePeriod)],
] as const;

/**
 * AC-07b: the save was refused because someone saved first; their values beside the user's (or
 * alone, for a removal), to take theirs or apply the user's change over them.
 */
function ConflictView({
  personName,
  conflict,
  yours,
  title = 'Your changes weren’t saved',
  yoursLabel = 'Your changes',
  useCurrentLabel = 'Use current values',
  reapplyLabel = 'Re-apply my changes',
  submitting,
  onUseCurrent,
  onReapply,
}: {
  personName: string;
  conflict: Conflict;
  /** The user's values; none for a removal. */
  yours: AllocationValues | null;
  title?: string;
  yoursLabel?: string;
  useCurrentLabel?: string;
  reapplyLabel?: string;
  submitting: boolean;
  onUseCurrent: () => void;
  onReapply: () => void;
}) {
  const at = changedAtText(conflict.changedAt);
  const time = at.slice(-5);
  const who = conflict.changedBy;
  return (
    <div role="alertdialog" aria-label={title} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {personName} · {conflict.current.projectName}
        </DialogDescription>
      </DialogHeader>
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <p>
          {who} changed this allocation at {time} while you were editing.
        </p>
      </Alert>
      <div className="overflow-auto rounded-lg border border-border">
        <Table aria-label="Compare versions">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <span className="sr-only">Field</span>
              </TableHead>
              <TableHead>
                Their version · {firstName(who)}, {time}
              </TableHead>
              {yours ? <TableHead>{yoursLabel}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {COMPARED.map(([label, value]) => {
              const theirs = value(conflict.current);
              const mine = yours ? value(yours) : null;
              const differs = mine !== null && mine !== theirs;
              return (
                <TableRow
                  key={label}
                  data-differs={differs || undefined}
                  className={cn(differs && 'bg-muted/50 font-medium')}
                >
                  <TableHead scope="row" className="font-normal text-muted-foreground">
                    {label}
                  </TableHead>
                  <TableCell className={label === 'Project' ? undefined : 'num'}>
                    {theirs}
                  </TableCell>
                  {yours ? (
                    <TableCell className={label === 'Project' ? undefined : 'num'}>
                      {mine}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {yours
          ? `Highlighted rows differ. “${reapplyLabel}” saves your values over ${firstName(who)}’s.`
          : `Last changed by ${who} · ${at}.`}
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onUseCurrent}>
          {useCurrentLabel}
        </Button>
        <Button onClick={onReapply} disabled={submitting}>
          {submitting ? 'Saving…' : reapplyLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * AC-07a, AC-09b: remove an allocation. One that has started ends yesterday and keeps its past
 * hours; one that has not is deleted. Either way it stays in the history.
 */
function RemoveBody({
  target,
  projects,
  today,
  onDone,
}: {
  target: AllocationTarget;
  projects: ReadonlyArray<FilterOption>;
  today: string;
  onDone: (message: string) => void;
}) {
  const fetcher = useFetcher<AllocationActionResult>();
  const [version, setVersion] = useState(target.allocation.version);
  const terms = allocationTerms(target.allocation, today);
  const closed = closedProject(target, projects);
  const name = allocationName(target.allocation);

  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const failure = result && !result.ok ? result : null;
  const submitting = fetcher.state !== 'idle';

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per answer, not per render
  useEffect(() => {
    if (result?.ok && result.intent === 'remove') {
      onDone(
        result.outcome === 'ended' && result.endsOn
          ? `${name} for ${target.employeeName} ends on ${longDate(result.endsOn)}.`
          : `${name} for ${target.employeeName} removed.`,
      );
    }
  }, [result]);

  const send = (atVersion: number) =>
    fetcher.submit(
      {
        intent: 'remove',
        allocationId: target.allocation.id,
        version: String(atVersion),
        projectName: name,
      },
      { method: 'post', action: ALLOCATION_ACTION },
    );

  if (failure?.kind === 'conflict') {
    return (
      <ConflictView
        personName={target.employeeName}
        conflict={failure}
        yours={null}
        title="The allocation changed meanwhile"
        useCurrentLabel="Keep it"
        reapplyLabel="Remove anyway"
        submitting={submitting}
        onUseCurrent={() => onDone(`${name} for ${target.employeeName} kept.`)}
        onReapply={() => {
          setVersion(failure.version);
          send(failure.version);
        }}
      />
    );
  }

  const error =
    failure?.kind === 'error'
      ? failure.error
      : failure?.kind === 'invalid'
        ? (failure.error ?? Object.values(failure.fieldErrors).flat()[0] ?? null)
        : null;
  const since = terms.started
    ? `since ${dayMonth(terms.startsOn)}`
    : `from ${longDate(terms.startsOn)}`;

  return (
    <div
      role="alertdialog"
      aria-label="Remove allocation?"
      aria-describedby={`remove-${target.allocation.id}`}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Remove allocation?</DialogTitle>
        <DialogDescription>
          {target.employeeName} · {name} · {rateText(terms.rateMinutes, terms.ratePeriod)} {since}
        </DialogDescription>
      </DialogHeader>
      {closed ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <p>{ALLOCATION_MESSAGE.closed(closed.name)}</p>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <p>{error}</p>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-1">
        <p id={`remove-${target.allocation.id}`}>
          {terms.started
            ? `The allocation will end yesterday (${dayMonth(dayBefore(today))}). Hours before today stay booked.`
            : 'The allocation will be deleted.'}
        </p>
        <p className="text-xs text-muted-foreground">It stays in the allocation history.</p>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button
          variant="destructive"
          disabled={submitting || closed !== null}
          onClick={() => send(version)}
        >
          <Trash2Icon aria-hidden="true" />
          {submitting ? 'Removing…' : 'Remove'}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function FieldShell({
  label,
  htmlFor,
  messageId,
  errors,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  messageId: string;
  errors?: ReadonlyArray<string>;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
      </label>
      {children}
      {errors && errors.length > 0 ? (
        <div id={messageId} role="alert" className="flex flex-col gap-1">
          {errors.map((error) => (
            <p
              key={error}
              className="flex items-start gap-1.5 text-xs font-medium text-destructive"
            >
              <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          ))}
        </div>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A value that can't change here, shown where its control would be. */
function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-medium">{label}</span>
      <div className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-input bg-muted/50 px-2.5">
        {children}
      </div>
    </div>
  );
}

export function DateInput({
  id,
  value,
  min,
  readOnly = false,
  onChange,
  ...aria
}: {
  id: string;
  value: string;
  min: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  'aria-describedby': string;
  'aria-invalid'?: boolean;
}) {
  const Icon = readOnly ? LockIcon : CalendarIcon;
  return (
    <div className="relative">
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="date"
        value={value}
        min={readOnly ? undefined : min}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={cn('num pl-8', readOnly && 'bg-muted/50')}
        {...aria}
      />
    </div>
  );
}

/** A project's colour as a small square, or the dashed one for leave. */
export function ProjectSwatch({ projectId }: { projectId: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-3 shrink-0 rounded-[2px]',
        projectId ? 'project-block' : 'border border-dashed border-ring bg-muted/50',
      )}
      style={projectId ? projectColorStyle(projectId) : undefined}
    />
  );
}
