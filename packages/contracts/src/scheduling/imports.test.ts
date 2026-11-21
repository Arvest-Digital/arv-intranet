import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ApiErrorBody } from '../shared';
import {
  ImportCompletedDetails,
  ImportPreview,
  ImportProblemRowsDetails,
  ImportResult,
  ImportStatus,
  ImportUpload,
  MissingPermissions,
} from './imports';

// Examples from docs/features/resource-scheduling/contracts/openapi.yaml (components.examples).
const importResult = {
  id: '01933b8e-0000-7000-8000-000000000801',
  importedBy: { id: '01933b8e-0000-7000-8000-000000000102', name: 'Test User 2' },
  employeeRecordsCreated: 30,
  projectsCreated: 42,
  allocationsCreated: 180,
  createdAt: '2026-10-31T09:00:00Z',
};
const problemRows = {
  error: {
    _tag: 'ValidationError',
    code: 'scheduling.import_problem_rows',
    message: '2 rows need fixing; nothing was imported',
    details: {
      rows: [
        { row: 14, reason: 'empty_hours', message: 'Hours are empty' },
        {
          row: 27,
          reason: 'similar_name',
          message: '«Test User 1» and «T. User 1» look like the same person',
        },
      ],
    },
  },
};
const alreadyCompleted = {
  error: {
    _tag: 'Conflict',
    code: 'scheduling.import_already_completed',
    message: 'The import is one-time; make later changes on the board',
    details: { completedAt: '2026-10-31T09:00:00Z' },
  },
};
const confirmationRequired = {
  error: {
    _tag: 'ConfirmationRequired',
    code: 'scheduling.import_confirmation_required',
    message: 'Review the import before confirming',
    details: {
      employeeRecordsToCreate: 30,
      projectsToCreate: 42,
      allocationsToCreate: 180,
      incompleteRecords: 2,
      overbookedWeeks: [{ fullName: 'Test User 5', weekStart: '2026-11-16', overMinutes: 240 }],
    },
  },
};
const forbidden = {
  error: {
    _tag: 'Forbidden',
    code: 'scheduling.missing_permission',
    message: 'You lack the permissions: manage employee records, manage projects',
    details: { missingPermissions: ['org:manage-employee-records', 'projects:manage-projects'] },
  },
};

const decodes = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Either.isRight(Schema.decodeUnknownEither(schema)(value));

describe('scheduling import contracts', () => {
  it('ImportResult and ImportStatus decode the examples and round-trip', () => {
    const result = Schema.decodeUnknownSync(ImportResult)(importResult);
    expect(result.createdAt).toEqual(new Date('2026-10-31T09:00:00Z'));
    expect(Schema.encodeSync(ImportResult)(result)).toEqual({
      ...importResult,
      createdAt: '2026-10-31T09:00:00.000Z',
    });
    expect(decodes(ImportStatus, { completed: true, run: importResult })).toBe(true);
    expect(decodes(ImportStatus, { completed: false, run: null })).toBe(true);
  });

  it('error examples decode as ApiErrorBody with their details schema', () => {
    for (const [example, details] of [
      [problemRows, ImportProblemRowsDetails],
      [alreadyCompleted, ImportCompletedDetails],
      [confirmationRequired, ImportPreview],
      [forbidden, MissingPermissions],
    ] as const) {
      const body = Schema.decodeUnknownSync(ApiErrorBody)(example);
      expect(decodes(details as Schema.Schema<unknown, unknown>, body.error.details)).toBe(true);
    }
  });

  it('ImportProblemRowsDetails refuses an unknown reason and an empty list', () => {
    expect(decodes(ImportProblemRowsDetails, { rows: [] })).toBe(false);
    expect(
      decodes(ImportProblemRowsDetails, { rows: [{ row: 2, reason: 'typo', message: 'x' }] }),
    ).toBe(false);
  });

  it('ImportUpload takes a file part and a text confirm flag, defaulting to not confirmed', () => {
    const file = { size: 3, text: async () => 'a,b' };
    expect(Schema.decodeUnknownSync(ImportUpload)({ file }).confirm).toBe(false);
    expect(Schema.decodeUnknownSync(ImportUpload)({ file, confirm: 'true' }).confirm).toBe(true);
    expect(decodes(ImportUpload, { file: 'a,b' })).toBe(false);
    expect(decodes(ImportUpload, { file, confirm: 'yes' })).toBe(false);
  });
});
