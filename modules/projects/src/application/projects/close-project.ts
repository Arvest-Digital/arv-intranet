import {
  Actor,
  CurrentActor,
  type ProjectId,
  requirePermission,
  Today,
  Unauthenticated,
  UnitOfWork,
} from '@arv/kernel';
import { Effect, Option } from 'effect';
import { ClosingConfirmationRequired, ProjectNotFound } from '../../domain/errors';
import { closeProject as closeOn } from '../../domain/project';
import { MANAGE_PROJECTS } from '../../permissions';
import { ProjectClosingHook, ProjectRepository } from '../ports';

export interface ProjectClose {
  /** The last bookable day, `YYYY-MM-DD`; today or later (AC-25). */
  readonly closeDate: string;
  /** The user saw the trims and removals and confirms them (AC-25, ADR-0010). */
  readonly confirm?: boolean;
}

/** The signed-in user the trims and removals are attributed to (AC-16). */
const closedBy = Effect.flatMap(
  CurrentActor,
  Actor.$match({
    Anonymous: () => Effect.fail(new Unauthenticated({})),
    User: ({ id }) => Effect.succeed(id),
  }),
);

/**
 * Critical flow 2, AC-25: sets the project's close date and trims its allocations to it.
 *
 * - Missing `projects:manage-projects` → `PermissionDenied`, nothing read (AC-26).
 * - Unknown project → `ProjectNotFound`.
 * - Already closed today → `ProjectClosed` (no reopening); a close date before today →
 *   `CloseDateInPast`, so past plans are never rewritten.
 * - Unless `confirm`, allocations that would end at the close date or be removed →
 *   `ClosingConfirmationRequired` listing them, and nothing is saved. The confirmed request
 *   recomputes everything on fresh data.
 * - Otherwise records the close date and calls `ProjectClosingHook.apply` in one unit of work
 *   (ADR-0006): the close and the trims commit or roll back together.
 */
export const closeProject = (id: ProjectId, input: ProjectClose) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_PROJECTS);
    const actor = yield* closedBy;
    const projects = yield* ProjectRepository;
    const hook = yield* ProjectClosingHook;
    const today = yield* Today;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const found = yield* projects.findById(id);
        if (Option.isNone(found)) return yield* new ProjectNotFound({ id });
        yield* closeOn(found.value, input.closeDate, yield* today.date);

        if (input.confirm !== true) {
          const impact = yield* hook.preview(id, input.closeDate);
          if (impact.endingAtCloseDate.length > 0 || impact.removed.length > 0) {
            return yield* new ClosingConfirmationRequired({
              closeDate: input.closeDate,
              endingAtCloseDate: impact.endingAtCloseDate,
              removed: impact.removed,
            });
          }
        }

        const saved = yield* projects.setCloseDate(id, input.closeDate);
        if (Option.isNone(saved)) return yield* new ProjectNotFound({ id });
        yield* hook.apply(id, input.closeDate, actor);
        return saved.value;
      }),
    );
  });
