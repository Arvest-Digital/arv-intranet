import {
  AllocationConflictDetails,
  AllocationImpact,
  AllocationRuleViolations,
  SchedulingErrorCodes,
  ValidationIssues,
} from '@arv/contracts/scheduling';
import { Option, Schema } from 'effect';
import type { ApiFailure } from '~/shared/lib/api.server';
import {
  ALLOCATION_MESSAGE,
  type AllocationActionResult,
  type AllocationField,
  ruleErrors,
} from './allocation';

const decodeRules = Schema.decodeUnknownOption(AllocationRuleViolations);
const decodeImpact = Schema.decodeUnknownOption(AllocationImpact);
const decodeConflict = Schema.decodeUnknownOption(AllocationConflictDetails);
const decodeIssues = Schema.decodeUnknownOption(ValidationIssues);

/** The body fields the api's validation issues name, as the form's fields. */
const ISSUE_FIELD: Record<string, AllocationField> = {
  employeeId: 'employeeId',
  projectId: 'projectId',
  startsOn: 'startsOn',
  endsOn: 'endsOn',
  rateMinutes: 'rate',
  ratePeriod: 'rate',
};

/**
 * A refused allocation write as the dialog shows it: rule errors under their fields (AC-09, AC-13),
 * the overbooked weeks to confirm (AC-10), the other user's values (AC-07b), a closed project
 * (AC-11) and the missing permission (AC-12). A 401 is the route's to turn into sign-in.
 */
export function allocationFailure(
  failed: ApiFailure,
  context: { readonly projectName?: string },
): AllocationActionResult {
  if (failed.status === 403)
    return { ok: false, kind: 'error', error: ALLOCATION_MESSAGE.forbidden };
  switch (failed.code) {
    case SchedulingErrorCodes.overbookingConfirmationRequired:
      return Option.match(decodeImpact(failed.details), {
        onNone: () => ({ ok: false, kind: 'error', error: failed.message }),
        onSome: (impact) => ({
          ok: false,
          kind: 'confirm',
          weeks: impact.overbookedWeeks.map((w) => ({ ...w })),
          onLeave: impact.workOnLeaveDays.map((w) => ({
            projectId: w.project.id,
            projectName: w.project.name,
            days: [...w.days],
          })),
        }),
      });
    case SchedulingErrorCodes.versionConflict:
      return Option.match(decodeConflict(failed.details), {
        onNone: () => ({ ok: false, kind: 'error', error: failed.message }),
        onSome: ({ current }) => {
          const first = current.segments[0];
          const last = current.segments[current.segments.length - 1] ?? first;
          return {
            ok: false,
            kind: 'conflict',
            message: failed.message,
            version: current.version,
            changedBy: current.lastChangedBy.name,
            changedAt: current.lastChangedAt.toISOString(),
            current: {
              projectName: current.project?.name ?? 'Away',
              startsOn: first.startsOn,
              endsOn: last.endsOn,
              rateMinutes: last.rateMinutes,
              ratePeriod: last.ratePeriod,
            },
          };
        },
      });
    case SchedulingErrorCodes.invalidAllocation:
    case SchedulingErrorCodes.pastNotRewritable:
    case SchedulingErrorCodes.outsideEmploymentPeriod:
    case SchedulingErrorCodes.pastProjectCloseDate:
    case SchedulingErrorCodes.notALeaveProject:
      return Option.match(decodeRules(failed.details), {
        onNone: () => ({ ok: false, kind: 'invalid', fieldErrors: {}, error: failed.message }),
        onSome: ({ rules, lastBookableDate }) => ({
          ok: false,
          kind: 'invalid',
          fieldErrors: ruleErrors(rules, lastBookableDate ?? null),
        }),
      });
    case 'platform.validation_failed':
      return Option.match(decodeIssues(failed.details), {
        onNone: () => ({ ok: false, kind: 'invalid', fieldErrors: {}, error: failed.message }),
        onSome: ({ issues }) => {
          const fieldErrors: Partial<Record<AllocationField, string[]>> = {};
          const loose: string[] = [];
          for (const issue of issues) {
            const field = ISSUE_FIELD[issue.path.split('.')[0] ?? ''];
            if (field) fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
            else loose.push(issue.message);
          }
          return {
            ok: false,
            kind: 'invalid',
            fieldErrors,
            ...(loose.length > 0 ? { error: loose.join('; ') } : {}),
          };
        },
      });
    case SchedulingErrorCodes.projectClosed:
      return {
        ok: false,
        kind: 'error',
        error: ALLOCATION_MESSAGE.closed(context.projectName ?? 'The project'),
      };
    case SchedulingErrorCodes.allocationNotFound:
      return { ok: false, kind: 'error', error: ALLOCATION_MESSAGE.gone };
    default:
      return { ok: false, kind: 'error', error: failed.message };
  }
}
