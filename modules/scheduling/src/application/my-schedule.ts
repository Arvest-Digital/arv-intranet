import { Actor, CurrentActor, Today, Unauthenticated } from '@arv/kernel';
import { OrgApi } from '@arv/org';
import { ProjectsApi } from '@arv/projects';
import { Effect, Option } from 'effect';
import type { IsoDate } from '../domain/allocation';
import { NotSetUpAsResource } from '../domain/errors';
import { viewerOf } from '../domain/visibility';
import { type BoardRow, type BoardWindow, boardWindow, buildRow } from './board';
import { AllocationRepository } from './ports';

/** The my-schedule query as the URL carries it: the same week window as the board (ADR-0002). */
export interface MyScheduleQuery {
  /** Any date in the first week; defaults to today's week. */
  readonly from?: IsoDate;
  /** Number of week columns, 1 to 12; defaults to 12. */
  readonly weeks?: number;
}

/** The signed-in resource's own row on the board window, redacted for them (read only). */
export interface MySchedule extends BoardWindow, BoardRow {}

/**
 * Flow 8: the signed-in user's own schedule (AC-17, AC-18, AC-29). No permission is needed: any
 * signed-in user whose login is linked to an employee record sees their own weeks.
 *
 * - Anonymous → `Unauthenticated`.
 * - Login linked to no employee record → `NotSetUpAsResource` (AC-18), nothing else read.
 * - A window outside the board's limits → `BoardWindowOutOfRange`.
 * - Own leave type always shown (AC-17, AC-29). The employment end date, allocations after it
 *   and needing-attention marks follow the same rule as on the board: the resource themselves sees
 *   them only with manage-employee-records or edit-allocations (AC-22).
 * - Read only: the result carries the figures, never an edit capability.
 */
export const getMySchedule = (query: MyScheduleQuery = {}) =>
  Effect.gen(function* () {
    const actor = yield* CurrentActor;
    if (!Actor.$is('User')(actor)) return yield* Effect.fail(new Unauthenticated({}));
    const org = yield* OrgApi;
    const own = yield* org.employeeByLogin(actor.id);
    if (Option.isNone(own)) {
      return yield* Effect.fail(new NotSetUpAsResource({ userId: actor.id }));
    }
    const resource = own.value;
    const today = yield* (yield* Today).date;
    const window = yield* boardWindow(today, query.from, query.weeks);
    const projectsApi = yield* ProjectsApi;
    const allocations = yield* AllocationRepository;

    const { holidays } = yield* org.employmentTerms([resource.employeeId], window);
    const inWindow = yield* allocations.listInWindow(window, {
      employeeIds: [resource.employeeId],
    });
    const projectList = yield* projectsApi.listByIds([
      ...new Set(inWindow.map((a) => a.projectId)),
    ]);

    const row = buildRow(
      viewerOf(actor, resource.employeeId),
      window,
      resource,
      inWindow,
      new Map(projectList.map((p) => [p.id, p])),
      new Set(holidays.map((h) => h.holidayDate)),
    );
    const schedule: MySchedule = { ...window, ...row };
    return schedule;
  });
