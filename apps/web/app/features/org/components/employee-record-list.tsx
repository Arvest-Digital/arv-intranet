import type { EmployeeRecord } from '@arv/contracts/org';
import { PencilIcon, SearchIcon, TriangleAlertIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '~/shared/lib/utils';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { Checkbox } from '~/shared/ui/checkbox';
import { Input } from '~/shared/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import {
  hoursOf,
  initialsOf,
  type Login,
  loginName,
  WEEKDAYS,
  workingDaysText,
} from '../employee-record';

const ALL = 'All';
const NO_TEAM = 'No team';

/**
 * The employee records with their team, contract hours, working days, employment period, linked
 * login and whether they are complete (AC-06). Filters by team, incomplete and name.
 */
export function EmployeeRecordList({
  records,
  logins,
  highlightId,
  action,
  onEdit,
}: {
  records: ReadonlyArray<EmployeeRecord>;
  /** null when the access list can't be read: the list says «Linked» instead of the login. */
  logins: ReadonlyArray<Login> | null;
  /** The record just saved. */
  highlightId?: string;
  /** The page's primary action, at the end of the toolbar. */
  action: ReactNode;
  onEdit: (record: EmployeeRecord) => void;
}) {
  const [team, setTeam] = useState(ALL);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [search, setSearch] = useState('');

  const teamNames = [...new Set(records.flatMap((r) => (r.team ? [r.team.name] : [])))].sort(
    (a, b) => a.localeCompare(b),
  );
  const teamChoices = [ALL, ...teamNames, ...(records.some((r) => !r.team) ? [NO_TEAM] : [])];
  const query = search.trim().toLowerCase();
  const shown = records.filter(
    (r) =>
      (team === ALL || (r.team?.name ?? NO_TEAM) === team) &&
      (!incompleteOnly || r.incomplete) &&
      (query === '' || r.fullName.toLowerCase().includes(query)),
  );
  const incompleteCount = records.filter((r) => r.incomplete).length;
  const loginById = new Map((logins ?? []).map((login) => [login.id, login]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {teamChoices.length > 2 ? (
          <fieldset className="inline-flex h-8 flex-wrap items-center gap-0.5 rounded-md border border-border bg-input/50 p-0.5">
            <legend className="sr-only">Team</legend>
            {teamChoices.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={team === choice}
                onClick={() => setTeam(choice)}
                className="h-6.5 cursor-pointer rounded-sm px-2.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 aria-pressed:bg-secondary aria-pressed:text-foreground"
              >
                {choice}
              </button>
            ))}
          </fieldset>
        ) : null}
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox inside is the control */}
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 px-1">
          <Checkbox checked={incompleteOnly} onCheckedChange={setIncompleteOnly} />
          Incomplete only
        </label>
        <div className="relative w-56 max-sm:w-full">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search people"
            placeholder="Search people…"
            className="h-8 pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="grow" />
        {action}
      </div>
      {records.length === 0 ? (
        <p className="text-muted-foreground">No employee records yet.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table aria-label="Employee records">
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Contract hours</TableHead>
                  <TableHead>Working days</TableHead>
                  <TableHead>Employment</TableHead>
                  <TableHead>Linked login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((record) => (
                  <RecordRow
                    key={record.id}
                    record={record}
                    login={record.userId ? loginById.get(record.userId) : undefined}
                    canNameLogin={logins !== null}
                    highlighted={record.id === highlightId}
                    onEdit={() => onEdit(record)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {shown.length === 0 ? (
            <p className="text-muted-foreground">No records match these filters.</p>
          ) : null}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {shown.length} of {records.length} records · {incompleteCount} incomplete
      </p>
    </div>
  );
}

function RecordRow({
  record,
  login,
  canNameLogin,
  highlighted,
  onEdit,
}: {
  record: EmployeeRecord;
  login?: Login;
  canNameLogin: boolean;
  highlighted: boolean;
  onEdit: () => void;
}) {
  return (
    <TableRow className={cn(highlighted && 'bg-muted/50')}>
      <TableCell>
        <span className="flex items-center gap-2 font-medium">
          <span
            aria-hidden="true"
            className="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-secondary text-xs font-medium"
          >
            {initialsOf(record.fullName)}
          </span>
          {record.fullName}
        </span>
      </TableCell>
      <TableCell className={cn(!record.team && 'text-muted-foreground')}>
        {record.team?.name ?? 'No team'}
      </TableCell>
      <TableCell
        className={cn('num text-right', record.contractMinutes === null && 'text-muted-foreground')}
      >
        {record.contractMinutes === null ? '—' : `${hoursOf(record.contractMinutes)}h`}
      </TableCell>
      <TableCell>
        <WorkingDays days={record.workingDays} />
      </TableCell>
      <TableCell className="num">
        {record.employmentStart ?? '—'} – {record.employmentEnd ?? 'present'}
      </TableCell>
      <TableCell>
        {record.userId === null ? (
          <span className="text-muted-foreground">Not linked</span>
        ) : login ? (
          <span className="num" title={login.email}>
            {loginName(login)}
          </span>
        ) : (
          <span>{canNameLogin ? 'Unknown login' : 'Linked'}</span>
        )}
      </TableCell>
      <TableCell>
        {record.incomplete ? (
          <Badge
            variant="outline"
            className="border-dashed border-foreground"
            title={
              record.contractMinutes === null
                ? 'Contract hours are missing'
                : 'Start date is missing'
            }
          >
            <TriangleAlertIcon aria-hidden="true" />
            Incomplete
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Complete
          </Badge>
        )}
      </TableCell>
      <TableCell className="py-1.5 text-right">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${record.fullName}`}
          onClick={onEdit}
        >
          <PencilIcon aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Seven day squares, the working ones filled; read out as «Mon–Fri». */
function WorkingDays({ days }: { days: ReadonlyArray<number> }) {
  return (
    <span role="img" aria-label={workingDaysText(days)} className="inline-flex gap-0.5">
      {WEEKDAYS.map(({ day, letter }) => (
        <span
          key={day}
          aria-hidden="true"
          className={cn(
            'grid size-5 place-items-center rounded-sm border border-border text-[11px] leading-none font-medium text-muted-foreground',
            days.includes(day) && 'border-ring bg-secondary text-foreground',
          )}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}
