import { Actor, CurrentActor, PermissionDenied, Unauthenticated, type UserId } from '@arv/kernel';
import { OrgApi } from '@arv/org';
import { Effect, Option } from 'effect';
import { canViewBoard, type Viewer, viewerOf } from '../domain/visibility';
import { VIEW_WHOLE_BOARD } from '../permissions';

/** A signed-in viewer of the board, before their own employee record is looked up. */
export interface BoardViewer {
  readonly userId: UserId;
  readonly viewer: Viewer;
}

/**
 * The board, the free list and allocation history need view-whole-board or edit-allocations on
 * this call's actor (AC-03, AC-12b, AC-14); checked before anything is read. Anonymous →
 * `Unauthenticated`; otherwise missing both → `PermissionDenied` naming view-whole-board.
 */
export const requireBoardViewer: Effect.Effect<
  BoardViewer,
  PermissionDenied | Unauthenticated,
  CurrentActor
> = Effect.flatMap(
  CurrentActor,
  Actor.$match({
    Anonymous: () => Effect.fail(new Unauthenticated({})),
    User: (user) => {
      const viewer = viewerOf(user, null);
      return canViewBoard(viewer)
        ? Effect.succeed({ userId: user.id, viewer })
        : Effect.fail(new PermissionDenied({ permission: VIEW_WHOLE_BOARD }));
    },
  }),
);

/** The viewer with the resource their login is linked to, if any: they see their own leave type (AC-29). */
export const withOwnEmployee = ({ userId, viewer }: BoardViewer) =>
  Effect.flatMap(OrgApi, (org) => org.employeeByLogin(userId)).pipe(
    Effect.map(
      (own): Viewer => ({
        ...viewer,
        ownEmployeeId: Option.match(own, {
          onNone: () => null,
          onSome: (resource) => resource.employeeId,
        }),
      }),
    ),
  );
