import { type FreeList, SchedulingErrorCodes } from '@arv/contracts/scheduling';
import { CircleCheckIcon, LockIcon, PlusIcon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { data, useNavigate, useRouteLoaderData, useSearchParams } from 'react-router';
import type { ApiResult } from '~/shared/lib/api.server';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import type { loader as rootLoader } from '../../../root';
import {
  boardHref,
  EDIT_ALLOCATIONS,
  isIsoDate,
  isoWeek,
  MANAGE_EMPLOYEE_RECORDS,
  mondayOf,
  parseBoardParams,
  SEE_LEAVE_REASONS,
} from '../board';
import {
  AllocationDialog,
  type AllocationDialogState,
  type Resource,
} from '../components/allocation-dialog';
import { type AllocationEditing, AllocationEditingContext } from '../components/allocation-popover';
import { ProjectGrid } from '../components/board-by-project';
import { PeopleGrid } from '../components/board-grid';
import { BoardLegend } from '../components/board-legend';
import {
  BoardForbidden,
  EmptyWindow,
  NoResults,
  WindowOutOfRange,
} from '../components/board-states';
import { BoardToolbar } from '../components/board-toolbar';
import { FreeListDrawer } from '../components/free-list-drawer';
import type { FreeListResult } from '../free-list';
import { schedulingGateway } from '../scheduling.server';
import type { Route } from './+types/board';

export const meta: Route.MetaFunction = () => [{ title: 'Schedule · ARV Intranet' }];

/**
 * The board for the window and filters in the URL (ADR-0002): `from`, `weeks`, `team`, `project`
 * and `view`. One `getBoard` call per window; by-project regroups the same response (AC-02b).
 * Without a board permission the page offers the viewer's own schedule (AC-03). With `free` set
 * the loader also asks who is free (`freeWeeks`, `minFreeHours`) for the drawer (AC-04, AC-05);
 * the board's window and filters do not apply to that list.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const params = parseBoardParams(new URL(request.url).searchParams);
  const gateway = schedulingGateway(context.cloudflare.env.API, await getSessionToken(request));
  const today = new Date().toISOString().slice(0, 10);

  const board = await gateway.getBoard(params);
  if (!board.ok) {
    if (board.status === 403) {
      return data({ kind: 'forbidden' as const }, { status: 403 });
    }
    const refused = await refusalResponse(board, request);
    if (refused) throw refused;
    if (board.code === SchedulingErrorCodes.windowOutOfRange) {
      return data({ kind: 'out-of-range' as const, message: board.message }, { status: 400 });
    }
    throw data('Could not load the schedule', { status: 502 });
  }

  // The filters' choices; without them the board still shows, with no choices to offer.
  const [teams, projects, free] = await Promise.all([
    gateway.listTeams(),
    gateway.listProjects(),
    params.free ? gateway.getFreeList(params.free) : null,
  ]);
  return {
    kind: 'board' as const,
    params,
    today,
    board: board.value,
    teams: teams.ok ? teams.value : [],
    projects: projects.ok ? projects.value : [],
    free: free === null ? null : await freeListResult(free, request),
  };
}

/** The drawer's content: the list, AC-05's message for a bad query, or a failure in its place. */
async function freeListResult(
  free: ApiResult<FreeList>,
  request: Request,
): Promise<FreeListResult> {
  if (free.ok) return { kind: 'list', list: free.value };
  const refused = await refusalResponse(free, request);
  if (refused) throw refused;
  if (free.status === 400) {
    const issues = free.details?.issues;
    return {
      kind: 'invalid',
      message: free.message,
      fields: Array.isArray(issues)
        ? issues.flatMap((issue: { path?: unknown }) =>
            typeof issue?.path === 'string' ? [issue.path] : [],
          )
        : [],
    };
  }
  return { kind: 'error', message: free.message };
}

export default function BoardRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === 'forbidden') return <BoardForbidden />;
  if (loaderData.kind === 'out-of-range') {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <WindowOutOfRange message={loaderData.message} />
      </main>
    );
  }

  return <BoardScreen data={loaderData} />;
}

/**
 * The «Allocate» link of «Who's free» (`allocate`, `allocateFrom`, `allocateTo`) opens «New
 * allocation» for that person over that period.
 */
function allocateFromUrl(search: URLSearchParams): AllocationDialogState | null {
  const employeeId = search.get('allocate');
  if (!employeeId) return null;
  const from = search.get('allocateFrom') ?? '';
  const to = search.get('allocateTo') ?? '';
  return {
    mode: 'create',
    employeeId,
    startsOn: isIsoDate(from) ? from : null,
    endsOn: isIsoDate(to) ? to : null,
  };
}

function BoardScreen({
  data: loaderData,
}: {
  data: Extract<Route.ComponentProps['loaderData'], { kind: 'board' }>;
}) {
  const me = useRouteLoaderData<typeof rootLoader>('root')?.me;
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [dialog, setDialog] = useState<AllocationDialogState | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { params, today, board, teams, projects, free } = loaderData;
  const permissions = me?.permissions ?? [];
  const canEdit = permissions.includes(EDIT_ALLOCATIONS);
  const canSeeLeaveReasons = permissions.includes(SEE_LEAVE_REASONS);
  // AC-22: the needing-attention mark only for those who may see it.
  const showAttention =
    permissions.includes(EDIT_ALLOCATIONS) || permissions.includes(MANAGE_EMPLOYEE_RECORDS);
  const currentMonday = mondayOf(today);
  const firstWeek = board.weeks[0] ?? currentMonday;
  const filtered = params.team !== null || params.project !== null;
  const empty = board.rows.length === 0;

  const fromUrl = canEdit ? allocateFromUrl(search) : null;
  const openDialog = dialog ?? fromUrl;
  const closeDialog = () => {
    setDialog(null);
    if (fromUrl) navigate(boardHref(params), { replace: true, preventScrollReset: true });
  };
  const editing = useMemo<AllocationEditing>(
    () => ({
      canEdit,
      today,
      open: (state) => {
        setDone(null);
        setDialog(state);
      },
    }),
    [canEdit, today],
  );
  const resources = useMemo<ReadonlyArray<Resource>>(
    () =>
      board.rows
        .map((r) => ({
          id: r.employee.id,
          fullName: r.employee.fullName,
          team: r.employee.team?.name ?? 'No team',
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [board.rows],
  );

  return (
    <AllocationEditingContext.Provider value={editing}>
      <main className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        {done ? (
          <Alert role="status" className="pr-12">
            <CircleCheckIcon aria-hidden="true" />
            <p>{done}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss"
              className="absolute top-2 right-2"
              onClick={() => setDone(null)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </Alert>
        ) : null}
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background [--namew:248px] max-sm:[--namew:168px]">
          <BoardToolbar
            params={params}
            from={board.from}
            weeks={board.weeks}
            today={today}
            teams={teams}
            projects={projects}
            canSeeLeaveReasons={canSeeLeaveReasons}
            actions={
              canEdit ? (
                <Button
                  size="sm"
                  aria-haspopup="dialog"
                  onClick={() =>
                    editing.open({ mode: 'create', employeeId: null, startsOn: null, endsOn: null })
                  }
                >
                  <PlusIcon aria-hidden="true" />
                  New allocation
                </Button>
              ) : null
            }
          />
          {firstWeek < currentMonday ? (
            <div
              role="status"
              className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2 text-[13px]"
            >
              <LockIcon aria-hidden="true" className="size-4" />
              Weeks before W{isoWeek(currentMonday)} are in the past and view only.
            </div>
          ) : null}
          <div className="relative max-h-[calc(100dvh-16rem)] min-h-64 overflow-auto overscroll-contain">
            {empty && filtered ? (
              <NoResults
                clearHref={boardHref(params, { team: null, project: null })}
                what={params.view === 'project' ? 'projects' : 'people'}
              />
            ) : params.view === 'project' ? (
              <ProjectGrid board={board} currentMonday={currentMonday} />
            ) : (
              <PeopleGrid board={board} currentMonday={currentMonday} />
            )}
            {!filtered && board.rows.every((r) => r.allocations.length === 0) ? (
              <EmptyWindow weeks={board.weeks.length} />
            ) : null}
          </div>
          <BoardLegend showAttention={showAttention} />
        </div>
        {params.free && free ? (
          <FreeListDrawer params={params} free={params.free} result={free} canEdit={canEdit} />
        ) : null}
        {canEdit ? (
          <AllocationDialog
            state={openDialog}
            resources={resources}
            projects={projects}
            today={today}
            onOpenChange={(open) => {
              if (!open) closeDialog();
            }}
            onDone={setDone}
          />
        ) : null}
      </main>
    </AllocationEditingContext.Provider>
  );
}
