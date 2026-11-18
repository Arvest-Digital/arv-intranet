import {
  AllocationHistoryQuery,
  AllocationIdPath,
  BoardQuery,
  FreeListQuery,
  MyScheduleQuery,
} from '@arv/contracts/scheduling';
import { type HttpEnv, runEffect, validate } from '@arv/platform/http';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { boardQueryFrom, getBoard } from '../application/board';
import { getFreeList } from '../application/free-list';
import { getAllocation } from '../application/get-allocation';
import { listAllocationHistory } from '../application/history';
import { getMySchedule } from '../application/my-schedule';
import { withRefs } from '../application/refs';
import { AllocationId } from '../domain/allocation';
import {
  mapSchedulingErrors,
  presentAllocation,
  presentAllocationHistoryPage,
  presentBoard,
  presentFreeList,
  presentMySchedule,
} from './presenter';

/** A query-string number as AC-05 reads it: blank or not a number is `NaN`, which fails the range. */
const queryNumber = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw));

/**
 * Scheduling read views (openapi.yaml `/scheduling/*`, US-01, US-02, US-05, US-06). The board, the
 * free list, an allocation and its history require `scheduling:view-whole-board` or
 * `scheduling:edit-allocations` (AC-03, AC-12b); my schedule only a login linked to an employee
 * record (AC-18). Each query checks access first and redacts before the presenter sees the result
 * (AC-22, AC-29).
 *
 * Mounted at `/` by the host, so paths here are the public paths.
 */
export const schedulingRoutes = new Hono<HttpEnv>()
  .get('/scheduling/board', validate('query', BoardQuery), (c) =>
    runEffect(
      c,
      getBoard(boardQueryFrom(c.req.valid('query'))).pipe(
        Effect.flatMap(
          withRefs((board) => ({
            teamIds: board.rows.map((row) => row.teamId),
            userIds: board.rows.flatMap((row) => row.allocations.map((a) => a.lastChangedBy)),
          })),
        ),
        Effect.map(presentBoard),
        mapSchedulingErrors,
      ),
    ),
  )
  .get('/scheduling/free-list', validate('query', FreeListQuery), (c) => {
    const { weeks, minFreeHours } = c.req.valid('query');
    return runEffect(
      c,
      getFreeList({ weeks: queryNumber(weeks), minFreeHours: queryNumber(minFreeHours) }).pipe(
        Effect.flatMap(
          withRefs((list) => ({
            teamIds: [
              ...list.entries.map((entry) => entry.resource.teamId),
              ...list.incompleteRecords.map((r) => r.teamId),
            ],
          })),
        ),
        Effect.map(presentFreeList),
        mapSchedulingErrors,
      ),
    );
  })
  .get('/scheduling/my-schedule', validate('query', MyScheduleQuery), (c) =>
    runEffect(
      c,
      getMySchedule(c.req.valid('query')).pipe(
        Effect.flatMap(
          withRefs((mine) => ({
            teamIds: [mine.teamId],
            userIds: mine.allocations.map((a) => a.lastChangedBy),
          })),
        ),
        Effect.map(presentMySchedule),
        mapSchedulingErrors,
      ),
    ),
  )
  .get('/scheduling/allocations/:allocationId', validate('param', AllocationIdPath), (c) =>
    runEffect(
      c,
      getAllocation(AllocationId.make(c.req.valid('param').allocationId)).pipe(
        Effect.flatMap(
          withRefs((allocation) => ({
            employeeIds: [allocation.employeeId],
            userIds: [allocation.lastChangedBy],
          })),
        ),
        Effect.map(presentAllocation),
        mapSchedulingErrors,
      ),
    ),
  )
  .get(
    '/scheduling/allocations/:allocationId/history',
    validate('param', AllocationIdPath),
    validate('query', AllocationHistoryQuery),
    (c) =>
      runEffect(
        c,
        listAllocationHistory(
          AllocationId.make(c.req.valid('param').allocationId),
          c.req.valid('query'),
        ).pipe(
          Effect.flatMap(
            withRefs((page) => ({
              employeeIds: page.items.map((item) => item.employeeId),
              userIds: page.items.map((item) => item.changedBy),
            })),
          ),
          Effect.map(presentAllocationHistoryPage),
          mapSchedulingErrors,
        ),
      ),
  );

/** Route types for the scheduling client in apps/web (`hc<SchedulingRoutes>`). */
export type SchedulingRoutes = typeof schedulingRoutes;
