import { EmployeeId } from '@arv/kernel';
import { Either, Schema } from 'effect';
import { TeamHasMembers } from './errors';
import { trimmedName } from './name';

export const TEAM_NAME_MAX_LENGTH = 100;

/** A team's id; used only inside `org`, so it stays in this module's domain. */
export const TeamId = Schema.UUID.pipe(Schema.brand('TeamId'));
export type TeamId = typeof TeamId.Type;

/** The display form of a team name: trimmed, non-empty, at most 100 characters. Decoding trims. */
export const TeamName = trimmedName(TEAM_NAME_MAX_LENGTH, 'TeamName');
export type TeamName = typeof TeamName.Type;

/** A named group of resources under one team lead (sad glossary); used to filter the board. */
export class Team extends Schema.Class<Team>('Team')({
  id: TeamId,
  name: Schema.String,
  /**
   * The lead's employee record. Required when a team is created by hand (AC-19d); null only for
   * a team the import created without one (data-model TBD).
   */
  teamLeadId: Schema.NullOr(EmployeeId),
  createdAt: Schema.DateFromSelf,
}) {}

/** Renames a team (AC-19d). Uniqueness of the name key is checked against the other teams. */
export const renameTeam = (team: Team, name: TeamName): Team => new Team({ ...team, name });

/** A team is removed only when no resource is in it; else names how many remain (AC-19d). */
export const checkTeamRemovable = (
  team: Team,
  memberCount: number,
): Either.Either<Team, TeamHasMembers> =>
  memberCount > 0
    ? Either.left(new TeamHasMembers({ id: team.id, memberCount }))
    : Either.right(team);
