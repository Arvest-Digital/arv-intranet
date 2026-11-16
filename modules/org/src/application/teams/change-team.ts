import { type EmployeeId, requirePermission, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { TeamNotFound } from '../../domain/errors';
import type { TeamId, TeamName } from '../../domain/team';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { TeamRepository } from '../ports';
import { requireTeamLead } from './require-team-lead';

/** A rename and/or a new lead (openapi `TeamChange`); fields left out keep their value. */
export interface TeamChange {
  readonly name?: TeamName;
  readonly teamLeadId?: EmployeeId;
}

/**
 * Flow 10, AC-19d: renames a team or changes its lead. Last write wins (sad §8).
 *
 * - Missing `org:manage-employee-records` → `PermissionDenied`, nothing read.
 * - Gone → `TeamNotFound`; a new lead that is not an employee record → `TeamLeadNotFound`.
 * - Another team has the same name ignoring case and surrounding spaces → `DuplicateTeamName`;
 *   respelling the team's own name is a rename.
 */
export const changeTeam = (id: TeamId, change: TeamChange) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_EMPLOYEE_RECORDS);
    const teams = yield* TeamRepository;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const found = yield* teams.findById(id);
        if (Option.isNone(found)) return yield* new TeamNotFound({ id });
        const { team } = found.value;

        const teamLeadId = change.teamLeadId ?? team.teamLeadId;
        // Only a newly named lead is looked up; the current one was checked when set.
        if (change.teamLeadId !== undefined && change.teamLeadId !== team.teamLeadId) {
          yield* requireTeamLead(change.teamLeadId);
        }

        const saved = yield* teams.update(id, {
          name: change.name ?? (team.name as TeamName),
          teamLeadId,
        });
        if (Option.isNone(saved)) return yield* new TeamNotFound({ id });
        return saved.value;
      }),
    );
  });
