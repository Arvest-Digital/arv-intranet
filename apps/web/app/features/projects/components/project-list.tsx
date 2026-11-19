import type { Project, ProjectType } from '@arv/contracts/projects';
import { ArchiveIcon, SearchIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { projectColorStyle } from '~/shared/lib/project-color';
import { cn } from '~/shared/lib/utils';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { Input } from '~/shared/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import { dateText, PROJECT_MESSAGE, PROJECT_TYPES, TYPE_LABEL } from '../project';

type TypeChoice = 'all' | ProjectType;
type StatusChoice = 'all' | 'open' | 'closed';

const TYPE_CHOICES: ReadonlyArray<readonly [TypeChoice, string]> = [
  ['all', 'All'],
  ...PROJECT_TYPES,
];
const STATUS_CHOICES: ReadonlyArray<readonly [StatusChoice, string]> = [
  ['all', 'All'],
  ['open', 'Open'],
  ['closed', 'Closed'],
];

/**
 * Every project the viewer may see, grouped by type (US-08), with its status and close date.
 * Holders of manage-projects see «New project» and «Close project» on open projects (AC-26).
 */
export function ProjectList({
  projects,
  canManage,
  highlightId,
  action,
  onClose,
}: {
  projects: ReadonlyArray<Project>;
  canManage: boolean;
  /** The project just created or closed. */
  highlightId?: string;
  /** The page's primary action, at the end of the toolbar. */
  action: ReactNode;
  onClose: (project: Project) => void;
}) {
  const [type, setType] = useState<TypeChoice>('all');
  const [status, setStatus] = useState<StatusChoice>('all');
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const shown = projects.filter(
    (p) =>
      (status === 'all' || p.status === status) &&
      (query === '' || p.name.toLowerCase().includes(query)),
  );
  const groups = PROJECT_TYPES.filter(([t]) => type === 'all' || t === type)
    .map(([t, label]) => ({ type: t, label, rows: shown.filter((p) => p.type === t) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Type" choices={TYPE_CHOICES} value={type} onChange={setType} />
        <Segmented label="Status" choices={STATUS_CHOICES} value={status} onChange={setStatus} />
        <div className="relative w-52 max-sm:w-full">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search projects"
            placeholder="Search projects…"
            className="h-8 pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="grow" />
        {action}
      </div>
      {projects.length === 0 ? (
        <p className="text-muted-foreground">No projects yet.</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">No projects match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table aria-label="Projects">
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <ProjectGroup
                  key={group.type}
                  label={group.label}
                  rows={group.rows}
                  columns={canManage ? 4 : 3}
                  canManage={canManage}
                  highlightId={highlightId}
                  onClose={onClose}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {PROJECT_MESSAGE.closedRule}
        {canManage ? null : ' Creating and closing projects needs the manage projects permission.'}
      </p>
    </div>
  );
}

function ProjectGroup({
  label,
  rows,
  columns,
  canManage,
  highlightId,
  onClose,
}: {
  label: string;
  rows: ReadonlyArray<Project>;
  columns: number;
  canManage: boolean;
  highlightId?: string;
  onClose: (project: Project) => void;
}) {
  return (
    <>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableHead scope="rowgroup" colSpan={columns} className="h-8 text-xs">
          {label}{' '}
          <span className="num font-normal text-muted-foreground">
            · {rows.length} {rows.length === 1 ? 'project' : 'projects'}
          </span>
        </TableHead>
      </TableRow>
      {rows.map((project) => {
        const closed = project.status === 'closed';
        return (
          <TableRow
            key={project.id}
            className={cn(
              closed && 'text-muted-foreground',
              project.id === highlightId && 'bg-muted/50',
            )}
          >
            <TableCell>
              <span className="flex items-center gap-2 font-medium">
                <Swatch project={project} />
                {project.name}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={cn(project.type === 'leave' && 'border-dashed')}>
                {TYPE_LABEL[project.type]}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={closed ? 'secondary' : 'outline'} className="num">
                {statusText(project)}
              </Badge>
            </TableCell>
            {canManage ? (
              <TableCell className="py-1.5 text-right">
                {closed ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-haspopup="dialog"
                    aria-label={`Close ${project.name}`}
                    onClick={() => onClose(project)}
                  >
                    <ArchiveIcon aria-hidden="true" />
                    Close project
                  </Button>
                )}
              </TableCell>
            ) : null}
          </TableRow>
        );
      })}
    </>
  );
}

/** «Open», «Open · until 15 Dec 2026» or «Closed · 17 Nov 2026». */
function statusText(project: Project): string {
  if (project.status === 'closed') {
    return project.closeDate ? `Closed · ${dateText(project.closeDate)}` : 'Closed';
  }
  return project.closeDate ? `Open · until ${dateText(project.closeDate)}` : 'Open';
}

/** The project's color, as the board shows it; leave projects are neutral. */
function Swatch({ project }: { project: Project }) {
  return project.type === 'leave' ? (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-[2px] border-l-3 border-muted-foreground bg-muted"
    />
  ) : (
    <span
      aria-hidden="true"
      className="project-block size-3 shrink-0 rounded-[2px]"
      style={projectColorStyle(project.id)}
    />
  );
}

function Segmented<V extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: ReadonlyArray<readonly [V, string]>;
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <fieldset className="inline-flex h-8 flex-wrap items-center gap-0.5 rounded-md border border-border bg-input/50 p-0.5">
      <legend className="sr-only">{label}</legend>
      {choices.map(([choice, text]) => (
        <button
          key={choice}
          type="button"
          aria-pressed={value === choice}
          onClick={() => onChange(choice)}
          className="h-6.5 cursor-pointer rounded-sm px-2.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 aria-pressed:bg-secondary aria-pressed:text-foreground"
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}
