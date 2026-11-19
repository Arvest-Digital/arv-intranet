import { SchedulingErrorCodes } from '@arv/contracts/scheduling';
import { LockIcon } from 'lucide-react';
import { data, useRouteLoaderData } from 'react-router';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import type { loader as rootLoader } from '../../../root';
import {
  boardHref,
  EDIT_ALLOCATIONS,
  isoWeek,
  MANAGE_EMPLOYEE_RECORDS,
  mondayOf,
  parseBoardParams,
  SEE_LEAVE_REASONS,
} from '../board';
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
import { schedulingGateway } from '../scheduling.server';
import type { Route } from './+types/board';

export const meta: Route.MetaFunction = () => [{ title: 'Schedule · ARV Intranet' }];

/**
 * The board for the window and filters in the URL (ADR-0002): `from`, `weeks`, `team`, `project`
 * and `view`. One `getBoard` call per window; by-project regroups the same response (AC-02b).
 * Without a board permission the page offers the viewer's own schedule (AC-03).
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
  const [teams, projects] = await Promise.all([gateway.listTeams(), gateway.listProjects()]);
  return {
    kind: 'board' as const,
    params,
    today,
    board: board.value,
    teams: teams.ok ? teams.value : [],
    projects: projects.ok ? projects.value : [],
  };
}

export default function BoardRoute({ loaderData }: Route.ComponentProps) {
  const me = useRouteLoaderData<typeof rootLoader>('root')?.me;
  if (loaderData.kind === 'forbidden') return <BoardForbidden />;
  if (loaderData.kind === 'out-of-range') {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <WindowOutOfRange message={loaderData.message} />
      </main>
    );
  }

  const { params, today, board, teams, projects } = loaderData;
  const permissions = me?.permissions ?? [];
  const canSeeLeaveReasons = permissions.includes(SEE_LEAVE_REASONS);
  // AC-22: the needing-attention mark only for those who may see it.
  const showAttention =
    permissions.includes(EDIT_ALLOCATIONS) || permissions.includes(MANAGE_EMPLOYEE_RECORDS);
  const currentMonday = mondayOf(today);
  const firstWeek = board.weeks[0] ?? currentMonday;
  const filtered = params.team !== null || params.project !== null;
  const empty = board.rows.length === 0;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Schedule</h1>
      <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background [--namew:248px] max-sm:[--namew:168px]">
        <BoardToolbar
          params={params}
          from={board.from}
          weeks={board.weeks}
          today={today}
          teams={teams}
          projects={projects}
          canSeeLeaveReasons={canSeeLeaveReasons}
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
    </main>
  );
}
