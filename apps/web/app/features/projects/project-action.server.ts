import { ProjectClosingImpact, ProjectsErrorCodes } from '@arv/contracts/projects';
import { Option, Schema } from 'effect';
import type { ApiFailure } from '~/shared/lib/api.server';
import { type ClosingRow, PROJECT_MESSAGE, type ProjectActionResult } from './project';

const decodeImpact = Schema.decodeUnknownOption(ProjectClosingImpact);

const rows = (
  allocations: ReadonlyArray<ProjectClosingImpact['removed'][number]>,
): ReadonlyArray<ClosingRow> =>
  allocations.map((a) => ({
    allocationId: a.allocationId,
    employeeName: a.employee.fullName,
    startsOn: a.startsOn,
    endsOn: a.endsOn,
  }));

/**
 * A refused project command as the page shows it: the duplicate name under the name (AC-24), the
 * allocations to confirm and a past close date under the date (AC-25). 401/403 are the route's to
 * turn into the refusal screens (AC-26).
 */
export function projectFailure(
  failed: ApiFailure,
  command: { name?: string },
): ProjectActionResult {
  switch (failed.code) {
    case ProjectsErrorCodes.duplicateOpenName:
      return {
        ok: false,
        kind: 'invalid',
        fieldErrors: { name: PROJECT_MESSAGE.duplicate((command.name ?? '').trim()) },
      };
    case ProjectsErrorCodes.closeDateInPast:
      return {
        ok: false,
        kind: 'invalid',
        fieldErrors: { closeDate: PROJECT_MESSAGE.closeDateInPast },
      };
    case ProjectsErrorCodes.closingConfirmationRequired:
      return Option.match(decodeImpact(failed.details), {
        onNone: () => ({ ok: false, kind: 'error', error: failed.message }),
        onSome: (impact) => ({
          ok: false,
          kind: 'confirm',
          closeDate: impact.closeDate,
          ending: rows(impact.endingAtCloseDate),
          removed: rows(impact.removed),
        }),
      });
    case ProjectsErrorCodes.projectClosed:
      return { ok: false, kind: 'error', error: PROJECT_MESSAGE.closed };
    case ProjectsErrorCodes.projectNotFound:
      return { ok: false, kind: 'error', error: PROJECT_MESSAGE.gone };
    default:
      return { ok: false, kind: 'error', error: failed.message };
  }
}
