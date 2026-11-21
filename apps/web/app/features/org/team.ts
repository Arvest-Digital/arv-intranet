/** The team screen's form fields, as the action names them when a refusal belongs under one. */
export type TeamField = 'name' | 'teamLeadId';

/** What the teams action answers the page. */
export type TeamActionResult =
  | {
      readonly ok: true;
      readonly intent: 'create' | 'update' | 'remove';
      readonly teamId: string;
    }
  /** A refusal under a field of the create or rename row (AC-19d). */
  | {
      readonly ok: false;
      readonly kind: 'invalid';
      readonly intent: 'create' | 'update';
      readonly teamId?: string;
      readonly fieldErrors: Partial<Record<TeamField, string>>;
    }
  /** The refusal above the list: a team that still has resources (AC-19d), or anything else. */
  | {
      readonly ok: false;
      readonly kind: 'error';
      readonly teamId?: string;
      readonly error: string;
    };

/** The design's words for the team refusals (AC-19d). */
export const TEAM_MESSAGE = {
  name: 'Enter a team name',
  nameTooLong: 'A team name is at most 100 characters',
  teamLead: 'Choose a team lead',
  teamLeadGone: 'This resource no longer exists.',
  duplicate: (name: string) => `A team named “${name}” already exists`,
  hasMembers: (team: string, count: number) =>
    `Can’t remove ${team} — ${count} ${count === 1 ? 'resource is' : 'resources are'} still in it.`,
  gone: 'This team no longer exists.',
} as const;
