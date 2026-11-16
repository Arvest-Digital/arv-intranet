import { Effect } from 'effect';
import type { Team } from '../../domain/team';
import { type EmployeeRef, employeeRefs } from '../employee-records/views';

/** A team with its lead named (openapi `Team`); `teamLead` is null when there is none or it is gone. */
export interface TeamView {
  readonly team: Team;
  readonly teamLead: EmployeeRef | null;
}

/** The teams with their leads, in the same order. Run after a use case has checked access. */
export const describeTeams = (teams: ReadonlyArray<Team>) =>
  Effect.gen(function* () {
    const leads = yield* employeeRefs(
      teams.flatMap((t) => (t.teamLeadId === null ? [] : [t.teamLeadId])),
    );
    return teams.map(
      (team): TeamView => ({
        team,
        teamLead: team.teamLeadId === null ? null : (leads.get(team.teamLeadId) ?? null),
      }),
    );
  });

export const describeTeam = (team: Team) =>
  describeTeams([team]).pipe(Effect.map(([view]) => view as TeamView));
