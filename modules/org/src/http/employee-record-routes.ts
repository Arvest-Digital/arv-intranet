import {
  EmployeeRecordChange,
  EmployeeRecordCreate,
  EmployeeRecordIdPath,
} from '@arv/contracts/org';
import { PageQuery } from '@arv/contracts/shared';
import { EmployeeId, UserId } from '@arv/kernel';
import { type HttpEnv, runEffect, validate } from '@arv/platform/http';
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import {
  changeEmployeeRecord,
  createEmployeeRecord,
  describeEmployeeRecord,
  describeEmployeeRecords,
  employeeRefs,
  getEmployeeRecord,
  listEmployeeRecords,
} from '../application/employee-records';
import { EmployeeName } from '../domain/employee-record';
import { TeamId } from '../domain/team';
import {
  capacityConfirmationRequired,
  type DescribedEmployeeRecordError,
  type EmployeeRecordError,
  employeeRecordVersionConflict,
  isDescribedEmployeeRecordError,
  isEmployeeRecordError,
  loginAlreadyLinked,
  presentEmployeeRecord,
  presentEmployeeRecordPage,
  toEmployeeRecordContractError,
} from './presenter';

/** The contract's name is already trimmed and within the domain's limit, so this never fails. */
const toEmployeeName = (name: string) => Schema.decode(EmployeeName)(name).pipe(Effect.orDie);

const toUserId = (id: string | null | undefined) =>
  id === undefined ? undefined : id === null ? null : UserId.make(id);

const toTeamId = (id: string | null | undefined) =>
  id === undefined ? undefined : id === null ? null : TeamId.make(id);

/** Looks up the names a richer failure's body shows, then fails with its contract error. */
const describeFailure = (error: DescribedEmployeeRecordError) =>
  Effect.gen(function* () {
    switch (error._tag) {
      case 'LoginAlreadyLinked': {
        const id = EmployeeId.make(error.employeeId);
        const refs = yield* employeeRefs([id]);
        return yield* Effect.fail(
          loginAlreadyLinked(refs.get(id) ?? { id, fullName: error.fullName, team: null }),
        );
      }
      case 'EmployeeRecordVersionConflict':
        return yield* Effect.fail(
          employeeRecordVersionConflict(yield* describeEmployeeRecord(error.current)),
        );
      case 'CapacityConfirmationRequired': {
        const weeks = error.overbookedWeeks;
        const refs = yield* employeeRefs(weeks.map((w) => EmployeeId.make(w.employeeId)));
        return yield* Effect.fail(capacityConfirmationRequired(weeks, refs));
      }
    }
  });

/**
 * Maps the employee-record domain failures to contract errors and lets every other failure
 * through (the kernel's access errors, which `runEffect` maps once).
 */
const mapEmployeeRecordErrors = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.catchAll(effect, (error) =>
    Effect.gen(function* () {
      if (isDescribedEmployeeRecordError(error)) return yield* describeFailure(error);
      return yield* Effect.fail(
        isEmployeeRecordError(error)
          ? toEmployeeRecordContractError(error)
          : (error as Exclude<E, EmployeeRecordError | DescribedEmployeeRecordError>),
      );
    }),
  );

/**
 * Employee records (openapi.yaml `/org/employee-records*`, flow 9). Every route requires
 * `org:manage-employee-records`, checked first in each use case (AC-22).
 */
export const employeeRecordRoutes = new Hono<HttpEnv>()
  .get('/org/employee-records', validate('query', PageQuery), (c) =>
    runEffect(
      c,
      listEmployeeRecords(c.req.valid('query')).pipe(
        Effect.flatMap((page) =>
          describeEmployeeRecords(page.items).pipe(Effect.map((items) => ({ ...page, items }))),
        ),
        Effect.map(presentEmployeeRecordPage),
        mapEmployeeRecordErrors,
      ),
    ),
  )
  .post('/org/employee-records', validate('json', EmployeeRecordCreate), (c) => {
    const body = c.req.valid('json');
    return runEffect(
      c,
      toEmployeeName(body.fullName).pipe(
        Effect.flatMap((fullName) =>
          createEmployeeRecord({
            fullName,
            userId: toUserId(body.userId) ?? null,
            teamId: toTeamId(body.teamId) ?? null,
            contractMinutes: body.contractMinutes ?? null,
            workingDays: body.workingDays,
            employmentStart: body.employmentStart ?? null,
            employmentEnd: body.employmentEnd ?? null,
          }),
        ),
        Effect.flatMap(describeEmployeeRecord),
        Effect.map(presentEmployeeRecord),
        mapEmployeeRecordErrors,
      ),
      201,
    );
  })
  .get('/org/employee-records/:employeeRecordId', validate('param', EmployeeRecordIdPath), (c) =>
    runEffect(
      c,
      getEmployeeRecord(EmployeeId.make(c.req.valid('param').employeeRecordId)).pipe(
        Effect.flatMap(describeEmployeeRecord),
        Effect.map(presentEmployeeRecord),
        mapEmployeeRecordErrors,
      ),
    ),
  )
  .patch(
    '/org/employee-records/:employeeRecordId',
    validate('param', EmployeeRecordIdPath),
    validate('json', EmployeeRecordChange),
    (c) => {
      const id = EmployeeId.make(c.req.valid('param').employeeRecordId);
      const { fullName, userId, teamId, ...rest } = c.req.valid('json');
      return runEffect(
        c,
        Effect.gen(function* () {
          const name = fullName === undefined ? undefined : yield* toEmployeeName(fullName);
          return yield* changeEmployeeRecord(id, {
            ...rest,
            fullName: name,
            userId: toUserId(userId),
            teamId: toTeamId(teamId),
          });
        }).pipe(
          Effect.flatMap(describeEmployeeRecord),
          Effect.map(presentEmployeeRecord),
          mapEmployeeRecordErrors,
        ),
      );
    },
  );
