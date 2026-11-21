import { CapacityImpact, OrgErrorCodes, TeamMembersDetails } from '@arv/contracts/org';
import { Option, Schema } from 'effect';
import type { ApiFailure } from '~/shared/lib/api.server';
import { HOLIDAY_MESSAGE, type HolidayActionResult, type HolidayField } from './holiday';
import { TEAM_MESSAGE, type TeamActionResult, type TeamField } from './team';

const ValidationIssues = Schema.Struct({
  issues: Schema.Array(Schema.Struct({ path: Schema.String, message: Schema.String })),
});

const decodeIssues = Schema.decodeUnknownOption(ValidationIssues);
const decodeMembers = Schema.decodeUnknownOption(TeamMembersDetails);
const decodeImpact = Schema.decodeUnknownOption(CapacityImpact);

/** The first validation issue under each known field, in the design's words. */
function issueFields<F extends string>(
  details: unknown,
  words: Partial<Record<string, readonly [F, string]>>,
): Partial<Record<F, string>> {
  const issues = Option.getOrElse(
    Option.map(decodeIssues(details), (d) => d.issues),
    () => [],
  );
  const fieldErrors: Partial<Record<F, string>> = {};
  for (const issue of issues) {
    const known = words[issue.path.split('.')[0] ?? ''];
    if (known) fieldErrors[known[0]] ??= known[1];
  }
  return fieldErrors;
}

/**
 * A refused team command as the teams page shows it (AC-19d): the duplicate name under the name,
 * a team that still has resources above the list. 401/403 are the route's to turn into the
 * refusal screens.
 */
export function teamFailure(
  failed: ApiFailure,
  command: { intent: 'create' | 'update' | 'remove'; teamId?: string; name: string; team?: string },
): TeamActionResult {
  const teamId = command.teamId ? { teamId: command.teamId } : {};
  const invalid = (fieldErrors: Partial<Record<TeamField, string>>): TeamActionResult =>
    command.intent === 'remove'
      ? { ok: false, kind: 'error', ...teamId, error: Object.values(fieldErrors)[0] ?? '' }
      : { ok: false, kind: 'invalid', intent: command.intent, ...teamId, fieldErrors };

  switch (failed.code) {
    case 'platform.validation_failed': {
      const fieldErrors = issueFields<TeamField>(failed.details, {
        name: ['name', command.name.trim() === '' ? TEAM_MESSAGE.name : TEAM_MESSAGE.nameTooLong],
        teamLeadId: ['teamLeadId', TEAM_MESSAGE.teamLead],
      });
      return Object.keys(fieldErrors).length > 0
        ? invalid(fieldErrors)
        : { ok: false, kind: 'error', ...teamId, error: failed.message };
    }
    case OrgErrorCodes.duplicateTeamName:
      return invalid({ name: TEAM_MESSAGE.duplicate(command.name.trim()) });
    case OrgErrorCodes.teamLeadNotFound:
      return invalid({ teamLeadId: TEAM_MESSAGE.teamLeadGone });
    case OrgErrorCodes.teamHasMembers:
      return Option.match(decodeMembers(failed.details), {
        onNone: () => ({ ok: false, kind: 'error', ...teamId, error: failed.message }),
        onSome: ({ memberCount }) => ({
          ok: false,
          kind: 'error',
          ...teamId,
          error: TEAM_MESSAGE.hasMembers(command.team ?? 'this team', memberCount),
        }),
      });
    case OrgErrorCodes.teamNotFound:
      return { ok: false, kind: 'error', ...teamId, error: TEAM_MESSAGE.gone };
    default:
      return { ok: false, kind: 'error', ...teamId, error: failed.message };
  }
}

/**
 * A refused holiday command as the holidays page shows it: the weeks to confirm (AC-19c, AC-27),
 * a date already on the list under the date. 401/403 are the route's (AC-28).
 */
export function holidayFailure(failed: ApiFailure, holidayDate: string): HolidayActionResult {
  switch (failed.code) {
    case 'platform.validation_failed': {
      const fieldErrors = issueFields<HolidayField>(failed.details, {
        holidayDate: ['holidayDate', HOLIDAY_MESSAGE.date],
        name: ['name', HOLIDAY_MESSAGE.name],
      });
      return Object.keys(fieldErrors).length > 0
        ? { ok: false, kind: 'invalid', fieldErrors }
        : { ok: false, kind: 'error', error: failed.message };
    }
    case OrgErrorCodes.duplicateHolidayDate:
      return {
        ok: false,
        kind: 'invalid',
        fieldErrors: { holidayDate: HOLIDAY_MESSAGE.duplicate(holidayDate) },
      };
    case OrgErrorCodes.capacityConfirmationRequired:
      return Option.match(decodeImpact(failed.details), {
        onNone: () => ({ ok: false, kind: 'error', error: failed.message }),
        onSome: ({ overbookedWeeks }) => ({
          ok: false,
          kind: 'confirm',
          weeks: overbookedWeeks.map((week) => ({
            employeeName: week.employee.fullName,
            weekStart: week.weekStart,
            overMinutes: week.overMinutes,
          })),
        }),
      });
    case OrgErrorCodes.holidayNotFound:
      return { ok: false, kind: 'error', error: HOLIDAY_MESSAGE.gone };
    default:
      return { ok: false, kind: 'error', error: failed.message };
  }
}
