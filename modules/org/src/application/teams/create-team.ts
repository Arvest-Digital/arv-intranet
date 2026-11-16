import { type EmployeeId, requirePermission, UnitOfWork } from '@arv/kernel';
import { Effect } from 'effect';
import type { TeamName } from '../../domain/team';
import { MANAGE_EMPLOYEE_RECORDS } from '../../permissions';
import { TeamRepository } from '../ports';
import { requireTeamLead } from './require-team-lead';

export interface CreateTeamInput {
  readonly name: TeamName;
  /** Required when a team is created by hand (AC-19d). */
  readonly teamLeadId: EmployeeId;
}

/**
 * Flow 10, AC-19d: creates a team with a resource as its lead.
 *
 * - Missing `org:manage-employee-records` → `PermissionDenied`, nothing read.
 * - The lead is not an employee record → `TeamLeadNotFound`.
 * - Another team has the same name ignoring case and surrounding spaces → `DuplicateTeamName`.
 */
export const createTeam = (input: CreateTeamInput) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_EMPLOYEE_RECORDS);
    const teams = yield* TeamRepository;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        yield* requireTeamLead(input.teamLeadId);
        return yield* teams.create({ name: input.name, teamLeadId: input.teamLeadId });
      }),
    );
  });
