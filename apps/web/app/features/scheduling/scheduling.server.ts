import type { OrgRoutes, ProjectsRoutes, SchedulingRoutes } from '@arv/api';
import { TeamPage } from '@arv/contracts/org';
import { ProjectPage } from '@arv/contracts/projects';
import { Board, FreeList, MySchedule } from '@arv/contracts/scheduling';
import { PAGE_LIMIT_MAX } from '@arv/contracts/shared';
import { Schema } from 'effect';
import { hc } from 'hono/client';
import { API_BASE_URL, type ApiResult, bindingFetch, failure } from '../../shared/lib/api.server';
import type { BoardParams, FilterOption, FreeParams } from './board';

const decodeBoard = Schema.decodeUnknownSync(Board);
const decodeFreeList = Schema.decodeUnknownSync(FreeList);
const decodeMySchedule = Schema.decodeUnknownSync(MySchedule);
const decodeTeamPage = Schema.decodeUnknownSync(TeamPage);
const decodeProjectPage = Schema.decodeUnknownSync(ProjectPage);

type Page<A> = {
  readonly items: ReadonlyArray<A>;
  readonly hasNext: boolean;
  readonly nextCursor: string | null;
};

/** Follows a cursor list to its end (teams and projects number in the hundreds at most). */
async function everyPage<A>(
  fetchPage: (after: string | undefined) => Promise<ApiResult<Page<A>>>,
): Promise<ApiResult<ReadonlyArray<A>>> {
  const items: A[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await fetchPage(after);
    if (!page.ok) return page;
    items.push(...page.value.items);
    if (!page.value.hasNext || !page.value.nextCursor) return { ok: true, value: items };
    after = page.value.nextCursor;
  }
}

const pageQuery = (after: string | undefined) => ({
  limit: PAGE_LIMIT_MAX,
  ...(after ? { after } : {}),
});

/**
 * Scheduling API calls for the board and my-schedule loaders, plus the team and project lists its filters offer.
 * `sessionToken` is forwarded as `Authorization: Bearer`; responses are decoded with the contracts.
 */
export function schedulingGateway(api: Fetcher, sessionToken: string | null) {
  const fetch = bindingFetch(api, sessionToken);
  const scheduling = hc<SchedulingRoutes>(API_BASE_URL, { fetch });
  const org = hc<OrgRoutes>(API_BASE_URL, { fetch });
  const projects = hc<ProjectsRoutes>(API_BASE_URL, { fetch });

  return {
    /**
     * The board for a week window (AC-01), narrowed by team and / or project (AC-02), already
     * redacted for the viewer (AC-22, AC-29). Without view-whole-board or edit-allocations it
     * answers 403 (AC-03); a window out of range answers 400.
     */
    async getBoard(params: BoardParams): Promise<ApiResult<Board>> {
      const res = await scheduling.scheduling.board.$get({
        query: {
          ...(params.from ? { from: params.from } : {}),
          weeks: params.weeks,
          ...(params.team ? { teamId: params.team } : {}),
          ...(params.project ? { projectId: params.project } : {}),
        },
      });
      if (!res.ok) return failure(res, 'Could not load the schedule');
      return { ok: true, value: decodeBoard(await res.json()) };
    },

    /**
     * «Who's free» from today over the next N weeks, most free first (AC-04), incomplete records
     * apart (AC-06). The raw query goes as typed: a bad value answers 400 with the AC-05 message.
     */
    async getFreeList(free: FreeParams): Promise<ApiResult<FreeList>> {
      const res = await scheduling.scheduling['free-list'].$get({
        query: { weeks: free.weeks, minFreeHours: free.minFreeHours },
      });
      if (!res.ok) return failure(res, 'Could not load who is free');
      return { ok: true, value: decodeFreeList(await res.json()) };
    },

    /**
     * The signed-in user's own schedule for a week window, with their own leave type (AC-17).
     * A login not linked to an employee record answers 404 `scheduling.not_a_resource` (AC-18).
     */
    async getMySchedule(window: {
      readonly from: string | null;
      readonly weeks: number;
    }): Promise<ApiResult<MySchedule>> {
      const res = await scheduling.scheduling['my-schedule'].$get({
        query: { ...(window.from ? { from: window.from } : {}), weeks: window.weeks },
      });
      if (!res.ok) return failure(res, 'Could not load your schedule');
      return { ok: true, value: decodeMySchedule(await res.json()) };
    },

    /** Every team, for the team filter (AC-02). */
    listTeams(): Promise<ApiResult<ReadonlyArray<FilterOption>>> {
      return everyPage(async (after) => {
        const res = await org.org.teams.$get({ query: pageQuery(after) });
        if (!res.ok) return failure(res, 'Could not load the teams');
        const page = decodeTeamPage(await res.json());
        return {
          ok: true,
          value: { ...page, items: page.items.map(({ id, name }) => ({ id, name })) },
        };
      });
    },

    /**
     * Every project, for the project filter (AC-02). The api leaves leave projects out for viewers
     * without see-leave-reasons (AC-29).
     */
    listProjects(): Promise<ApiResult<ReadonlyArray<FilterOption>>> {
      return everyPage(async (after) => {
        const res = await projects.projects.$get({ query: pageQuery(after) });
        if (!res.ok) return failure(res, 'Could not load the projects');
        const page = decodeProjectPage(await res.json());
        return {
          ok: true,
          value: {
            ...page,
            items: page.items.map(({ id, name, type, status }) => ({ id, name, type, status })),
          },
        };
      });
    },
  };
}
