import { Schema } from 'effect';
import { EmployeeRef, strict } from './values';

/**
 * A team name as a request sends it: surrounding spaces are trimmed (names are compared ignoring
 * them and letter case, AC-19d), then 1 to 100 characters remain.
 */
export const TeamNameInput = Schema.Trim.pipe(
  Schema.minLength(1, { message: () => 'Enter a team name' }),
  Schema.maxLength(100),
);

/** A team (OpenAPI `Team`); `teamLead: null` = none (a team the import made without one). */
export const Team = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  teamLead: Schema.NullOr(EmployeeRef),
  createdAt: Schema.Date,
});
export type Team = typeof Team.Type;
export type TeamEncoded = typeof Team.Encoded;

/** `listTeams` 200: a cursor page in id (creation) order. */
export const TeamPage = Schema.Struct({
  items: Schema.Array(Team),
  hasNext: Schema.Boolean,
  hasPrev: Schema.Boolean,
  nextCursor: Schema.NullOr(Schema.UUID),
});
export type TeamPage = typeof TeamPage.Type;
export type TeamPageEncoded = typeof TeamPage.Encoded;

/** `createTeam` body (AC-19d): a team made by hand always has a lead. */
export const TeamCreate = strict(Schema.Struct({ name: TeamNameInput, teamLeadId: Schema.UUID }));
export type TeamCreate = typeof TeamCreate.Type;

/** `updateTeam` body (AC-19d): a new name, a new lead, or both; fields left out keep their value. */
export const TeamChange = strict(
  Schema.Struct({
    name: Schema.optionalWith(TeamNameInput, { exact: true }),
    teamLeadId: Schema.optionalWith(Schema.UUID, { exact: true }),
  }),
).pipe(
  Schema.filter((change) => change.name !== undefined || change.teamLeadId !== undefined, {
    message: () => 'Change the name or the team lead',
  }),
);
export type TeamChange = typeof TeamChange.Type;

/** `teamId` path parameter. */
export const TeamIdPath = Schema.Struct({ teamId: Schema.UUID });
