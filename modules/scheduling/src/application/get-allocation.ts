import { type EmployeeId, Today, type UserId } from '@arv/kernel';
import { OrgApi } from '@arv/org';
import { type ProjectInfo, ProjectsApi } from '@arv/projects';
import { Effect, Option } from 'effect';
import { type AllocationId, Segment } from '../domain/allocation';
import { AllocationNotFound } from '../domain/errors';
import { employmentEndView, ProjectLabel, projectLabel } from '../domain/visibility';
import { runsPastEmploymentEnd } from '../domain/weekly-figures';
import { termsOf } from './allocations/context';
import { AllocationRepository } from './ports';
import { requireBoardViewer, withOwnEmployee } from './viewer';

/** One allocation as the edit form opens it, already redacted for the viewer (AC-07, AC-22, AC-29). */
export interface AllocationView {
  readonly id: AllocationId;
  readonly employeeId: EmployeeId;
  /** `null` for leave whose type the viewer may not see: only «away» (AC-29). */
  readonly project: ProjectInfo | null;
  readonly away: boolean;
  /** Every segment, oldest first, cut at an employment end the viewer may not see (AC-22). */
  readonly segments: readonly [Segment, ...Segment[]];
  /** Runs past the employment end (AC-21); `null` when the viewer may not see the mark (AC-22). */
  readonly needsAttention: boolean | null;
  /** The version the edit form sends back (AC-07b). */
  readonly version: number;
  readonly lastChangedBy: UserId;
  readonly lastChangedAt: Date;
  readonly createdAt: Date;
}

/**
 * US-05: one allocation with the version the edit form must send back and who changed it last
 * (AC-07, AC-07b, AC-12b, AC-22, AC-29).
 *
 * - Neither view-whole-board nor edit-allocations → `PermissionDenied`, nothing read.
 * - Unknown or removed → `AllocationNotFound`. So is one that lies wholly after an employment end
 *   the viewer may not see: answering otherwise would reveal that the end exists (AC-22).
 * - Leave shows as «away» without its project unless the viewer may see its type (AC-29).
 */
export const getAllocation = (id: AllocationId) =>
  Effect.gen(function* () {
    const boardViewer = yield* requireBoardViewer;
    const allocations = yield* AllocationRepository;
    const found = yield* allocations.findById(id);
    if (Option.isNone(found))
      return yield* Effect.fail(new AllocationNotFound({ allocationId: id }));
    const { allocation, lastChangedBy, lastChangedAt, createdAt } = found.value;

    const viewer = yield* withOwnEmployee(boardViewer);
    const today = yield* (yield* Today).date;
    const org = yield* OrgApi;
    const projectsApi = yield* ProjectsApi;
    const { resources } = yield* org.employmentTerms([allocation.employeeId], {
      from: today,
      to: today,
    });
    const [resource] = resources;
    // No foreign key across modules, but employee records are never deleted: a missing one is a defect.
    if (resource === undefined) {
      return yield* Effect.die(
        new Error(`allocation ${id} references unknown employee ${allocation.employeeId}`),
      );
    }
    const project = Option.getOrUndefined(yield* projectsApi.get(allocation.projectId));
    if (project === undefined) {
      return yield* Effect.die(
        new Error(`allocation ${id} references unknown project ${allocation.projectId}`),
      );
    }

    const end = employmentEndView(viewer, resource.employmentEnd);
    const until = end.allocationsUntil;
    const [first, ...rest] =
      until === null
        ? allocation.segments
        : allocation.segments
            .filter((s) => s.startsOn <= until)
            .map((s) => (s.endsOn <= until ? s : new Segment({ ...s, endsOn: until })));
    if (first === undefined)
      return yield* Effect.fail(new AllocationNotFound({ allocationId: id }));

    const label = projectLabel(viewer, resource.employeeId, {
      id: project.id,
      name: project.name,
      isLeave: project.type === 'leave',
    });
    const view: AllocationView = {
      id: allocation.id,
      employeeId: allocation.employeeId,
      project: ProjectLabel.$is('Away')(label) ? null : project,
      away: project.type === 'leave',
      segments: [first, ...rest],
      needsAttention: end.needingAttention
        ? runsPastEmploymentEnd(allocation, termsOf(resource))
        : null,
      version: allocation.version,
      lastChangedBy,
      lastChangedAt,
      createdAt,
    };
    return view;
  });
