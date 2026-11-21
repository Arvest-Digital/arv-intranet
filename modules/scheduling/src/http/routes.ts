import {
  AllocationChange,
  AllocationCreate,
  AllocationHistoryQuery,
  AllocationIdPath,
  AllocationRemovalQuery,
  BoardQuery,
  FreeListQuery,
  ImportUpload,
  LeaveBooking,
  MyScheduleQuery,
} from '@arv/contracts/scheduling';
import { EmployeeId, ProjectId } from '@arv/kernel';
import { type HttpEnv, runEffect, validate } from '@arv/platform/http';
import { Effect, Option } from 'effect';
import { Hono } from 'hono';
import { changeAllocation, createAllocation, removeAllocation } from '../application/allocations';
import { boardQueryFrom, getBoard } from '../application/board';
import type { AllocationChangedMeanwhile } from '../application/errors';
import { getFreeList } from '../application/free-list';
import { type AllocationView, getAllocation, viewAllocation } from '../application/get-allocation';
import { listAllocationHistory } from '../application/history';
import { getImportStatus, importSpreadsheet } from '../application/import-commit';
import { bookLeave } from '../application/leave';
import { getMySchedule } from '../application/my-schedule';
import type { StoredAllocation } from '../application/ports';
import { withRefs } from '../application/refs';
import { AllocationId, type IsoDate } from '../domain/allocation';
import type { OverbookingConfirmationRequired } from '../domain/errors';
import {
  allocationVersionConflict,
  mapSchedulingErrors,
  overbookingConfirmationRequired,
  presentAllocation,
  presentAllocationHistoryPage,
  presentAllocationRemoval,
  presentBoard,
  presentFreeList,
  presentImportResult,
  presentImportStatus,
  presentMySchedule,
} from './presenter';

/** A query-string number as AC-05 reads it: blank or not a number is `NaN`, which fails the range. */
const queryNumber = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw));

/** The names an allocation answer shows beside its ids. */
const allocationRefs = withRefs((allocation: AllocationView) => ({
  employeeIds: [allocation.employeeId],
  userIds: [allocation.lastChangedBy],
}));

/** A saved allocation as the writer may see it (leave type redacted, AC-29), as `Allocation`. */
const presentSaved = (saved: StoredAllocation) =>
  viewAllocation(saved).pipe(Effect.flatMap(allocationRefs), Effect.map(presentAllocation));

/** AC-07b: the current values and who changed them, redacted for the writer; nothing was saved. */
const describeConflict = (error: AllocationChangedMeanwhile) =>
  viewAllocation(error.current).pipe(
    Effect.flatMap(allocationRefs),
    Effect.flatMap((current) => Effect.fail(allocationVersionConflict(current))),
  );

/** AC-10, AC-15: the overbooked weeks and the work on leave days, with their projects named. */
const describeOverbooking = (error: OverbookingConfirmationRequired) =>
  withRefs((impact: OverbookingConfirmationRequired) => ({
    projectIds: impact.workOnLeaveDays.map((c) => ProjectId.make(c.projectId)),
  }))(error).pipe(Effect.flatMap((impact) => Effect.fail(overbookingConfirmationRequired(impact))));

/**
 * Scheduling read views and allocation writes (openapi.yaml `/scheduling/*`, US-01 to US-06).
 * Writes require `scheduling:edit-allocations`, checked first on this request (AC-12, AC-14); a
 * save that overbooks answers `ConfirmationRequired` until re-sent with `confirm: true` (ADR-0010). The board, the
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
        Effect.flatMap(allocationRefs),
        Effect.map(presentAllocation),
        mapSchedulingErrors,
      ),
    ),
  )
  .post('/scheduling/allocations', validate('json', AllocationCreate), (c) => {
    const body = c.req.valid('json');
    return runEffect(
      c,
      createAllocation({
        ...body,
        employeeId: EmployeeId.make(body.employeeId),
        projectId: ProjectId.make(body.projectId),
        startsOn: body.startsOn as IsoDate,
        endsOn: body.endsOn as IsoDate,
      }).pipe(
        Effect.flatMap(presentSaved),
        Effect.catchTag('OverbookingConfirmationRequired', describeOverbooking),
        mapSchedulingErrors,
      ),
      201,
    );
  })
  .patch(
    '/scheduling/allocations/:allocationId',
    validate('param', AllocationIdPath),
    validate('json', AllocationChange),
    (c) => {
      const { startsOn, endsOn, ...rest } = c.req.valid('json');
      return runEffect(
        c,
        changeAllocation(AllocationId.make(c.req.valid('param').allocationId), {
          ...rest,
          ...(startsOn === undefined ? {} : { startsOn: startsOn as IsoDate }),
          ...(endsOn === undefined ? {} : { endsOn: endsOn as IsoDate }),
        }).pipe(
          Effect.flatMap(presentSaved),
          Effect.catchTags({
            AllocationChangedMeanwhile: describeConflict,
            OverbookingConfirmationRequired: describeOverbooking,
          }),
          mapSchedulingErrors,
        ),
      );
    },
  )
  .delete(
    '/scheduling/allocations/:allocationId',
    validate('param', AllocationIdPath),
    validate('query', AllocationRemovalQuery),
    (c) =>
      runEffect(
        c,
        removeAllocation(
          AllocationId.make(c.req.valid('param').allocationId),
          c.req.valid('query').version,
        ).pipe(
          Effect.map(presentAllocationRemoval),
          Effect.catchTag('AllocationChangedMeanwhile', describeConflict),
          mapSchedulingErrors,
        ),
      ),
  )
  .post('/scheduling/leave', validate('json', LeaveBooking), (c) => {
    const body = c.req.valid('json');
    return runEffect(
      c,
      bookLeave({
        ...body,
        employeeId: EmployeeId.make(body.employeeId),
        projectId: ProjectId.make(body.projectId),
        startsOn: body.startsOn as IsoDate,
        endsOn: body.endsOn as IsoDate,
      }).pipe(
        Effect.flatMap(presentSaved),
        Effect.catchTag('OverbookingConfirmationRequired', describeOverbooking),
        mapSchedulingErrors,
      ),
      201,
    );
  })
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
  )
  // The one-time import (US-11, flow 13). The upload is multipart: the file is read only after
  // the access and one-time checks, and never stored (ADR-0010).
  .get('/scheduling/import', (c) =>
    runEffect(
      c,
      getImportStatus.pipe(
        Effect.flatMap(
          withRefs((run) => ({ userIds: Option.toArray(run).map((r) => r.importedBy) })),
        ),
        Effect.map(presentImportStatus),
        mapSchedulingErrors,
      ),
    ),
  )
  .post('/scheduling/import', validate('form', ImportUpload), (c) => {
    const { file, confirm } = c.req.valid('form');
    return runEffect(
      c,
      importSpreadsheet({ file, confirm }).pipe(
        Effect.flatMap(withRefs((run) => ({ userIds: [run.importedBy] }))),
        Effect.map(presentImportResult),
        mapSchedulingErrors,
      ),
      201,
    );
  });

/** Route types for the scheduling client in apps/web (`hc<SchedulingRoutes>`). */
export type SchedulingRoutes = typeof schedulingRoutes;
