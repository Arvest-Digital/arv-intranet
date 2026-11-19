import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { Button, buttonVariants } from '~/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';
import {
  type BoardParams,
  boardHref,
  type FilterOption,
  TYPE_LABEL,
  windowLabel,
  windowNav,
  ZOOMS,
} from '../board';

const segClass =
  'inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-background p-0.5';
const segItemClass = (active: boolean) =>
  cn(
    'inline-flex h-[26px] items-center justify-center rounded-sm px-2.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30',
    active && 'bg-secondary text-foreground',
  );

/**
 * A segmented control of links: each option is a URL (ADR-0002). Options are data, so a later
 * «Days» zoom (PRD §8) is one more entry.
 */
export function Segmented({
  label,
  options,
  className,
}: {
  label: string;
  options: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly href: string;
    readonly active: boolean;
  }>;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn(segClass, className)}>
      {options.map((option) => (
        <Link
          key={option.key}
          to={option.href}
          aria-current={option.active ? 'true' : undefined}
          className={segItemClass(option.active)}
          preventScrollReset
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** Previous / today / next as links; a disabled one is a disabled button (no URL to go to). */
function NavStep({
  to,
  label,
  children,
}: {
  to: string | null;
  label?: string;
  children: React.ReactNode;
}) {
  const size = label ? 'icon-sm' : 'sm';
  if (to === null) {
    return (
      <Button variant="outline" size={size} aria-label={label} disabled>
        {children}
      </Button>
    );
  }
  return (
    <Link
      to={to}
      aria-label={label}
      preventScrollReset
      className={buttonVariants({ variant: 'outline', size })}
    >
      {children}
    </Link>
  );
}

/** A single-choice filter (the api narrows by one team and / or one project, AC-02). */
function FilterMenu({
  label,
  value,
  sections,
  note,
  onChange,
}: {
  label: string;
  value: string | null;
  sections: ReadonlyArray<{
    readonly heading: string;
    readonly options: ReadonlyArray<FilterOption>;
  }>;
  note?: string;
  onChange: (id: string | null) => void;
}) {
  const all = sections.flatMap((s) => s.options);
  const current = all.find((o) => o.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label={`${label}: ${current?.name ?? 'All'}`} />
        }
      >
        <span className="font-normal text-muted-foreground">{label}</span>
        <span className="max-w-40 truncate">{current?.name ?? 'All'}</span>
        <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-64">
        <DropdownMenuRadioGroup
          value={value ?? ''}
          onValueChange={(next: string) => onChange(next === '' ? null : next)}
        >
          <DropdownMenuRadioItem value="">All</DropdownMenuRadioItem>
          {sections.map((section) =>
            section.options.length === 0 ? null : (
              <DropdownMenuGroup key={section.heading}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="px-3 py-1.5 text-xs text-muted-foreground">
                  {section.heading}
                </DropdownMenuLabel>
                {section.options.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    <span className="truncate">{option.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuGroup>
            ),
          )}
        </DropdownMenuRadioGroup>
        {note ? <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground">{note}</p> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Project filter sections: open projects by type, then closed ones. */
function projectSections(projects: ReadonlyArray<FilterOption>) {
  const open = projects.filter((p) => p.status !== 'closed');
  const byType = (['client', 'internal', 'bench', 'training', 'leave'] as const).map((type) => ({
    heading: TYPE_LABEL[type],
    options: open.filter((p) => p.type === type),
  }));
  return [...byType, { heading: 'Closed', options: projects.filter((p) => p.status === 'closed') }];
}

/**
 * The board's toolbar: grouping (by people / by project, AC-02b), the week window (a week at a
 * time within the limits, AC-01) with zoom presets that only set `weeks`, and the team / project
 * filters (AC-02). Every control is a URL change; the loader does the rest (ADR-0002).
 */
export function BoardToolbar({
  params,
  from,
  weeks,
  today,
  teams,
  projects,
  canSeeLeaveReasons,
}: {
  params: BoardParams;
  /** The window's first Monday, as the api answered it. */
  from: string;
  weeks: ReadonlyArray<string>;
  today: string;
  teams: ReadonlyArray<FilterOption>;
  projects: ReadonlyArray<FilterOption>;
  canSeeLeaveReasons: boolean;
}) {
  const navigate = useNavigate();
  const nav = windowNav(today, from, params.weeks);
  const go = (patch: Partial<BoardParams>) =>
    navigate(boardHref(params, patch), { preventScrollReset: true });
  // AC-29: no leave projects for viewers without see-leave-reasons (the api leaves them out too).
  const offered = canSeeLeaveReasons ? projects : projects.filter((p) => p.type !== 'leave');
  const filtered = params.team !== null || params.project !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <Segmented
        label="Group schedule"
        options={[
          {
            key: 'people',
            label: 'By people',
            href: boardHref(params, { view: 'people' }),
            active: params.view === 'people',
          },
          {
            key: 'project',
            label: 'By project',
            href: boardHref(params, { view: 'project' }),
            active: params.view === 'project',
          },
        ]}
      />
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border max-sm:hidden" />
      <div className="flex flex-wrap items-center gap-1">
        <NavStep
          to={nav.prev === null ? null : boardHref(params, { from: nav.prev })}
          label="Previous week"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </NavStep>
        <NavStep to={nav.today === null ? null : boardHref(params, { from: null })}>Today</NavStep>
        <NavStep
          to={nav.next === null ? null : boardHref(params, { from: nav.next })}
          label="Next week"
        >
          <ChevronRightIcon aria-hidden="true" />
        </NavStep>
        <span className="num mx-1 ml-2 text-[13px] whitespace-nowrap" aria-live="polite">
          {windowLabel(weeks)}
        </span>
        <Segmented
          label="Zoom: number of week columns"
          className="ml-2"
          options={ZOOMS.map(([n, label]) => ({
            key: String(n),
            label,
            href: boardHref(params, { weeks: n }),
            active: params.weeks === n,
          }))}
        />
      </div>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border max-sm:hidden" />
      <div className="flex flex-wrap items-center gap-1">
        <FilterMenu
          label="Team"
          value={params.team}
          sections={[{ heading: 'Teams', options: teams }]}
          onChange={(team) => go({ team })}
        />
        <FilterMenu
          label="Project"
          value={params.project}
          sections={projectSections(offered)}
          note={
            canSeeLeaveReasons
              ? undefined
              : 'Leave shows as «Away». Leave types are hidden for your role.'
          }
          onChange={(project) => go({ project })}
        />
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => go({ team: null, project: null })}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
