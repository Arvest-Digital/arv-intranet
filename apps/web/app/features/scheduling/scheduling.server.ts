import type { OrgRoutes, ProjectsRoutes, SchedulingRoutes } from '@arv/api';
import { TeamPage } from '@arv/contracts/org';
import { ProjectPage } from '@arv/contracts/projects';
import {
  Allocation,
  type AllocationChange,
  type AllocationCreate,
  type AllocationHistoryEntry,
  AllocationHistoryPage,
  AllocationRemoval,
  Board,
  FreeList,
  ImportResult,
  ImportStatus,
  type LeaveBooking,
  MySchedule,
} from '@arv/contracts/scheduling';
import { PAGE_LIMIT_MAX } from '@arv/contracts/shared';
import { Schema } from 'effect';
import { hc } from 'hono/client';
import { API_BASE_URL, type ApiResult, bindingFetch, failure } from '../../shared/lib/api.server';
import type { BoardParams, FilterOption, FreeParams } from './board';

const decodeBoard = Schema.decodeUnknownSync(Board);
const decodeFreeList = Schema.decodeUnknownSync(FreeList);
const decodeMySchedule = Schema.decodeUnknownSync(MySchedule);
const decodeAllocation = Schema.decodeUnknownSync(Allocation);
const decodeRemoval = Schema.decodeUnknownSync(AllocationRemoval);
const decodeHistoryPage = Schema.decodeUnknownSync(AllocationHistoryPage);
const decodeImportStatus = Schema.decodeUnknownSync(ImportStatus);
const decodeImportResult = Schema.decodeUnknownSync(ImportResult);
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

    /**
     * Allocates a resource to an open project (AC-07). A save that overbooks answers 409
     * `ConfirmationRequired` until re-sent with `confirm: true` (AC-10, ADR-0010); broken rules
     * answer 400 with `details.rules` (AC-09, AC-13); a closed project 409 (AC-11); no
     * edit-allocations 403 (AC-12).
     */
    async createAllocation(body: AllocationCreate): Promise<ApiResult<Allocation>> {
      const res = await scheduling.scheduling.allocations.$post({ json: body });
      if (!res.ok) return failure(res, 'Could not save the allocation');
      return { ok: true, value: decodeAllocation(await res.json()) };
    },

    /**
     * Changes an allocation from today on (AC-09b) at the version it was opened at; a stale
     * version answers 409 `version_conflict` with the current values (AC-07b).
     */
    async changeAllocation(
      allocationId: string,
      body: AllocationChange,
    ): Promise<ApiResult<Allocation>> {
      const res = await scheduling.scheduling.allocations[':allocationId'].$patch({
        param: { allocationId },
        json: body,
      });
      if (!res.ok) return failure(res, 'Could not save the allocation');
      return { ok: true, value: decodeAllocation(await res.json()) };
    },

    /** Ends a started allocation yesterday, or deletes one that has not started (AC-07a, AC-09b). */
    async removeAllocation(
      allocationId: string,
      version: number,
    ): Promise<ApiResult<AllocationRemoval>> {
      const res = await scheduling.scheduling.allocations[':allocationId'].$delete({
        param: { allocationId },
        query: { version: String(version) },
      });
      if (!res.ok) return failure(res, 'Could not remove the allocation');
      return { ok: true, value: decodeRemoval(await res.json()) };
    },

    /**
     * Books whole working days of leave on an open leave-type project (AC-15). Work on the leave
     * days answers 409 `ConfirmationRequired` with `workOnLeaveDays` until re-sent with
     * `confirm: true`; a work project answers 400 `not_a_leave_project`.
     */
    async bookLeave(body: LeaveBooking): Promise<ApiResult<Allocation>> {
      const res = await scheduling.scheduling.leave.$post({ json: body });
      if (!res.ok) return failure(res, 'Could not book the leave');
      return { ok: true, value: decodeAllocation(await res.json()) };
    },

    /**
     * An allocation's changes over the last 12 months, oldest first, every page (AC-16); leave
     * the viewer may not see the type of comes as «away» with no project (AC-29).
     */
    listAllocationHistory(
      allocationId: string,
    ): Promise<ApiResult<ReadonlyArray<AllocationHistoryEntry>>> {
      return everyPage(async (after) => {
        const res = await scheduling.scheduling.allocations[':allocationId'].history.$get({
          param: { allocationId },
          query: pageQuery(after),
        });
        if (!res.ok) return failure(res, 'Could not load the history');
        return { ok: true, value: decodeHistoryPage(await res.json()) };
      });
    },

    /**
     * Whether the one-time import has run, and its run when it has (AC-32). Without all three
     * import permissions it answers 403 naming each one missing (AC-33).
     */
    async getImportStatus(): Promise<ApiResult<ImportStatus>> {
      const res = await scheduling.scheduling.import.$get();
      if (!res.ok) return failure(res, 'Could not load the import');
      return { ok: true, value: decodeImportStatus(await res.json()) };
    },

    /**
     * Uploads the planning spreadsheet (US-11). Without `confirm` nothing is saved: a clean file
     * answers 409 `import_confirmation_required` with the preview (AC-30), problem rows 400
     * `import_problem_rows` (AC-31), a finished import 409 `import_already_completed` (AC-32).
     * With `confirm` the same file is imported in one step.
     */
    async importSpreadsheet(file: File, confirm: boolean): Promise<ApiResult<ImportResult>> {
      const res = await scheduling.scheduling.import.$post({
        form: { file, confirm: confirm ? 'true' : 'false' },
      });
      if (!res.ok) return failure(res, 'Could not import the spreadsheet');
      return { ok: true, value: decodeImportResult(await res.json()) };
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
