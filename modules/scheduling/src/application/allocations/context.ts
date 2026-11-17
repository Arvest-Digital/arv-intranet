import { Actor, CurrentActor, type EmployeeId, type ProjectId, Unauthenticated } from '@arv/kernel';
import { OrgApi, type ResourceTerms } from '@arv/org';
import { type ProjectInfo, ProjectsApi } from '@arv/projects';
import { Effect, Option } from 'effect';
import type { AllocationId, BookingContext, IsoDate } from '../../domain/allocation';
import { addDays, type EmploymentTerms, type Holidays, isoWeekStart } from '../../domain/capacity';
import {
  EmployeeRecordNotFound,
  type OverbookedWeek,
  OverbookingConfirmationRequired,
  ProjectNotFound,
  type WorkOnLeaveDays,
} from '../../domain/errors';
import type { AllocationImpact } from '../../domain/overbooking';
import type { ResourceSchedule } from '../../domain/weekly-figures';
import { type AllocationInWindow, AllocationRepository } from '../ports';

/** The signed-in user a write is stamped with («last changed by», AC-07). */
export const changedBy = Effect.flatMap(
  CurrentActor,
  Actor.$match({
    Anonymous: () => Effect.fail(new Unauthenticated({})),
    User: ({ id }) => Effect.succeed(id),
  }),
);

/** The project, read through the projects facade; unknown → `ProjectNotFound`. */
export const loadProject = (projectId: ProjectId) =>
  Effect.flatMap(ProjectsApi, (projects) => projects.get(projectId)).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new ProjectNotFound({ projectId })),
        onSome: (project) => Effect.succeed<ProjectInfo>(project),
      }),
    ),
  );

/** Every whole ISO week (Monday to Sunday) that `dates` touch. */
export const weeksAround = (dates: ReadonlyArray<IsoDate>) => {
  const sorted = [...dates].sort();
  const first = sorted[0] as IsoDate;
  const last = sorted[sorted.length - 1] as IsoDate;
  return { from: isoWeekStart(first), to: addDays(isoWeekStart(last), 6) };
};

/** A resource as an allocation command checks it: its terms and the holidays of the window. */
export interface ResourceFacts {
  readonly resource: ResourceTerms;
  readonly terms: EmploymentTerms;
  readonly holidays: Holidays;
}

/**
 * The resource's employment terms and the public holidays in `window`, through the org facade;
 * an unknown resource → `EmployeeRecordNotFound`.
 */
export const loadResource = (employeeId: EmployeeId, window: { from: IsoDate; to: IsoDate }) =>
  Effect.gen(function* () {
    const org = yield* OrgApi;
    const { resources, holidays } = yield* org.employmentTerms([employeeId], window);
    const resource = resources.find((r) => r.employeeId === employeeId);
    if (resource === undefined) return yield* new EmployeeRecordNotFound({ employeeId });
    const facts: ResourceFacts = {
      resource,
      terms: {
        contractMinutes: resource.contractMinutes,
        workingDays: resource.workingDays,
        employmentStart: resource.employmentStart,
        employmentEnd: resource.employmentEnd,
      },
      holidays: new Set(holidays.map((h) => h.holidayDate)),
    };
    return facts;
  });

/** What the domain checks a booking against (AC-09, AC-09b, AC-13, AC-25). */
export const bookingContext = (
  today: IsoDate,
  facts: ResourceFacts,
  project: ProjectInfo,
): BookingContext => ({
  today,
  employment: { startsOn: facts.terms.employmentStart, endsOn: facts.terms.employmentEnd },
  workingDaysPerWeek: new Set(facts.terms.workingDays).size,
  projectCloseDate: project.closeDate,
});

/** An allocation as the overbooking check sees it; `id` is null for one not created yet. */
export interface PlannedAllocation {
  readonly id: AllocationId | null;
  readonly projectId: ProjectId;
  readonly segments: AllocationInWindow['segments'];
}

/**
 * The resource's schedule over `window`: its terms and its allocations there, without `exceptId`
 * (the allocation being changed).
 */
export const loadSchedule = (
  employeeId: EmployeeId,
  window: { from: IsoDate; to: IsoDate },
  facts: ResourceFacts,
  exceptId: AllocationId | null,
) =>
  Effect.gen(function* () {
    const allocations = yield* AllocationRepository;
    const inWindow = yield* allocations.listInWindow(window, { employeeIds: [employeeId] });
    const schedule: ResourceSchedule<PlannedAllocation> = {
      terms: facts.terms,
      allocations: inWindow.filter((a) => a.id !== exceptId),
    };
    return schedule;
  });

/**
 * AC-10, AC-15: fails `OverbookingConfirmationRequired` when the impact is not empty, unless the
 * user confirmed. The confirmed request has recomputed it on fresh data (ADR-0010).
 */
export const requireConfirmation = (
  impact: AllocationImpact<PlannedAllocation>,
  confirm: boolean | undefined,
): Effect.Effect<void, OverbookingConfirmationRequired> => {
  if (confirm === true) return Effect.void;
  if (impact.overbookedWeeks.length === 0 && impact.workOnLeaveDays.length === 0) {
    return Effect.void;
  }
  const overbookedWeeks: ReadonlyArray<OverbookedWeek> = impact.overbookedWeeks.map((week) => ({
    weekStart: week.weekStart,
    capacity: week.capacity,
    allocated: week.allocated,
    over: week.over,
  }));
  const workOnLeaveDays: ReadonlyArray<WorkOnLeaveDays> = impact.workOnLeaveDays.map(
    ({ allocation, days }) => ({
      allocationId: allocation.id,
      projectId: allocation.projectId,
      days: days as [IsoDate, ...IsoDate[]],
    }),
  );
  return Effect.fail(new OverbookingConfirmationRequired({ overbookedWeeks, workOnLeaveDays }));
};
