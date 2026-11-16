import { requirePermission, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { TeamNotFound } from '../../domain/errors';
import { checkTeamRemovable, type TeamId } from '../../domain/team';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { TeamRepository } from '../ports';

/**
 * Flow 10, AC-19d: removes an empty team.
 *
 * - Missing `org:manage-employee-records` → `PermissionDenied`, nothing read.
 * - Gone → `TeamNotFound`.
 * - Still has resources → `TeamHasMembers` naming how many (the FK RESTRICT is the backstop).
 */
export const removeTeam = (id: TeamId) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_EMPLOYEE_RECORDS);
    const teams = yield* TeamRepository;
    const unitOfWork = yield* UnitOfWork;

    yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const found = yield* teams.findById(id);
        if (Option.isNone(found)) return yield* new TeamNotFound({ id });
        yield* checkTeamRemovable(found.value.team, found.value.memberCount);
        if (!(yield* teams.delete(id))) return yield* new TeamNotFound({ id });
      }),
    );
  });
