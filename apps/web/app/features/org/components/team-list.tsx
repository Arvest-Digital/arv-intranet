import type { EmployeeRecord, Team } from '@arv/contracts/org';
import { CircleAlertIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { useFetcher } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import { Input } from '~/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import type { TeamActionResult, TeamField } from '../team';

type FieldErrors = Partial<Record<TeamField, string>>;

/**
 * The teams with their lead and how many resources are in each (US-07). Create, rename and
 * change the lead inline; remove from the row. Refusals: a duplicate name under the name, a team
 * that still has resources above the list (AC-19d).
 */
export function TeamList({
  teams,
  records,
}: {
  teams: ReadonlyArray<Team>;
  /** Every employee record: the team lead choices and each team's resource count. */
  records: ReadonlyArray<EmployeeRecord>;
}) {
  const fetcher = useFetcher<TeamActionResult>();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const submitting = fetcher.state !== 'idle';

  // Close the row once its save went through.
  useEffect(() => {
    if (!result?.ok) return;
    if (result.intent === 'create') setCreating(false);
    if (result.intent === 'update') setEditingId(null);
  }, [result]);

  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.team) counts.set(record.team.id, (counts.get(record.team.id) ?? 0) + 1);
  }
  const noTeam = records.filter((record) => !record.team).length;
  const leads = [...records]
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((record) => ({ value: record.id, label: record.fullName }));

  const errorsFor = (intent: 'create' | 'update', teamId?: string): FieldErrors =>
    result &&
    !result.ok &&
    result.kind === 'invalid' &&
    result.intent === intent &&
    result.teamId === teamId
      ? result.fieldErrors
      : {};
  const listError = result && !result.ok && result.kind === 'error' ? result.error : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="grow" />
        <Button
          onClick={() => {
            setCreating(true);
            setEditingId(null);
          }}
          disabled={creating}
        >
          <PlusIcon aria-hidden="true" />
          New team
        </Button>
      </div>
      {listError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <p>{listError}</p>
        </Alert>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table aria-label="Teams">
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>Team</TableHead>
              <TableHead>Team lead</TableHead>
              <TableHead className="text-right">Resources</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {creating ? (
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={4}>
                  <TeamForm
                    fetcher={fetcher}
                    intent="create"
                    label="New team"
                    leads={leads}
                    errors={errorsFor('create')}
                    submitting={submitting}
                    submitLabel="Create"
                    onCancel={() => setCreating(false)}
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {teams.map((team) =>
              editingId === team.id ? (
                <TableRow key={team.id} className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={4}>
                    <TeamForm
                      fetcher={fetcher}
                      intent="update"
                      team={team}
                      label={`Rename ${team.name}`}
                      leads={leads}
                      errors={errorsFor('update', team.id)}
                      submitting={submitting}
                      submitLabel="Save"
                      onCancel={() => setEditingId(null)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={team.id}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell className={cn(!team.teamLead && 'text-muted-foreground')}>
                    {team.teamLead?.fullName ?? 'No lead'}
                  </TableCell>
                  <TableCell className="num text-right">{counts.get(team.id) ?? 0}</TableCell>
                  <TableCell className="py-1.5 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Rename ${team.name}`}
                      onClick={() => {
                        setEditingId(team.id);
                        setCreating(false);
                      }}
                    >
                      <PencilIcon aria-hidden="true" />
                      Rename
                    </Button>
                    <fetcher.Form method="post" className="inline">
                      <input type="hidden" name="intent" value="remove" />
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="teamName" value={team.name} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Remove ${team.name}`}
                        disabled={submitting}
                      >
                        <Trash2Icon aria-hidden="true" />
                        Remove
                      </Button>
                    </fetcher.Form>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>
      {teams.length === 0 && !creating ? (
        <p className="text-muted-foreground">No teams yet.</p>
      ) : null}
      {noTeam > 0 ? (
        <p className="text-xs text-muted-foreground">
          {noTeam} {noTeam === 1 ? 'resource has' : 'resources have'} no team and{' '}
          {noTeam === 1 ? 'shows' : 'show'} under “No team” on the board.
        </p>
      ) : null}
    </div>
  );
}

/** The inline create / rename row: name, team lead, submit and cancel, errors under them. */
function TeamForm({
  fetcher,
  intent,
  team,
  label,
  leads,
  errors,
  submitting,
  submitLabel,
  onCancel,
}: {
  fetcher: ReturnType<typeof useFetcher<TeamActionResult>>;
  intent: 'create' | 'update';
  team?: Team;
  label: string;
  leads: ReadonlyArray<{ value: string; label: string }>;
  errors: FieldErrors;
  submitting: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const id = useId();
  const nameId = `${id}-name`;
  const leadId = `${id}-lead`;
  const lead = team?.teamLead?.id ?? null;
  return (
    <fetcher.Form method="post" className="flex flex-col gap-1.5">
      <input type="hidden" name="intent" value={intent} />
      {team ? <input type="hidden" name="teamId" value={team.id} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={nameId} className={cn('font-medium', team && 'sr-only')}>
          {team ? 'Team name' : label}
        </label>
        <Input
          id={nameId}
          name="name"
          autoFocus
          className="h-8 w-56 max-sm:w-full"
          defaultValue={team?.name ?? ''}
          {...(errors.name ? { 'aria-invalid': true, 'aria-describedby': `${nameId}-error` } : {})}
        />
        <span id={leadId} className="sr-only">
          Team lead
        </span>
        <Select name="teamLeadId" items={leads} defaultValue={lead}>
          <SelectTrigger
            size="sm"
            className="w-56 max-sm:w-full"
            aria-labelledby={leadId}
            {...(errors.teamLeadId
              ? { 'aria-invalid': true, 'aria-describedby': `${leadId}-error` }
              : {})}
          >
            <SelectValue placeholder="Choose a team lead" />
          </SelectTrigger>
          <SelectContent>
            {leads.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <FieldError id={`${nameId}-error`}>{errors.name}</FieldError>
      <FieldError id={`${leadId}-error`}>{errors.teamLeadId}</FieldError>
    </fetcher.Form>
  );
}

function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-xs font-medium text-destructive"
    >
      <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      {children}
    </p>
  );
}
