import {
  ImportCompletedDetails,
  ImportPreview,
  ImportProblemRowsDetails,
  MissingPermissions,
  SchedulingErrorCodes,
  ValidationIssues,
} from '@arv/contracts/scheduling';
import { Option, Schema } from 'effect';
import type { ApiFailure } from '~/shared/lib/api.server';
import type { ImportActionResult } from './import';

const decodePreview = Schema.decodeUnknownOption(ImportPreview);
const decodeProblems = Schema.decodeUnknownOption(ImportProblemRowsDetails);
const decodeCompleted = Schema.decodeUnknownOption(ImportCompletedDetails);
const decodeMissing = Schema.decodeUnknownOption(MissingPermissions);
const decodeIssues = Schema.decodeUnknownOption(ValidationIssues);

/** AC-33: the permissions a 403 names, or none when it names none. */
export const missingOf = (failed: ApiFailure): ReadonlyArray<string> =>
  Option.match(decodeMissing(failed.details), {
    onNone: () => [],
    onSome: ({ missingPermissions }) => [...missingPermissions],
  });

/**
 * A refused upload as the page shows it: the preview to confirm (AC-30), the problem rows (AC-31),
 * the finished import (AC-32), the missing permissions (AC-33) or why the file can't be read. A
 * 401 is the route's to turn into sign-in.
 */
export function importFailure(failed: ApiFailure): ImportActionResult {
  if (failed.status === 403) return { kind: 'perms', missing: missingOf(failed) };
  switch (failed.code) {
    case SchedulingErrorCodes.importConfirmationRequired:
      return Option.match(decodePreview(failed.details), {
        onNone: () => ({ kind: 'error', message: failed.message }),
        onSome: (preview) => ({ kind: 'preview', preview }),
      });
    case SchedulingErrorCodes.importProblemRows:
      return Option.match(decodeProblems(failed.details), {
        onNone: () => ({ kind: 'error', message: failed.message }),
        onSome: ({ rows }) => ({ kind: 'problems', rows: rows.map((r) => ({ ...r })) }),
      });
    case SchedulingErrorCodes.importAlreadyCompleted:
      return {
        kind: 'completed',
        completedAt: Option.match(decodeCompleted(failed.details), {
          onNone: () => null,
          onSome: ({ completedAt }) => completedAt,
        }),
      };
    case 'platform.validation_failed':
      return {
        kind: 'invalid',
        message: Option.match(decodeIssues(failed.details), {
          onNone: () => failed.message,
          onSome: ({ issues }) => issues.map((i) => i.message).join('; ') || failed.message,
        }),
      };
    default:
      return { kind: 'error', message: failed.message };
  }
}
