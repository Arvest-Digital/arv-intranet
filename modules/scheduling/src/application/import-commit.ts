import { type EmployeeId, type ProjectId, requirePermission, UnitOfWork } from '@arv/kernel';
import { OrgApi } from '@arv/org';
import { ProjectsApi } from '@arv/projects';
import { Effect, Option } from 'effect';
import { HistoryEntry } from '../domain/allocation';
import {
  ImportAlreadyCompleted,
  ImportConfirmationRequired,
  ImportFileInvalid,
} from '../domain/errors';
import { projectKey } from '../domain/import-rows';
import { EDIT_ALLOCATIONS } from '../permissions';
import { changedBy } from './allocations/context';
import { planImport, requireImportPermissions } from './import-preview';
import {
  AllocationHistoryRepository,
  AllocationRepository,
  ImportRunRepository,
  type NewAllocation,
  type StoredImportRun,
} from './ports';

/** The uploaded spreadsheet: read only after the access and one-time checks pass. */
export interface SpreadsheetUpload {
  readonly size: number;
  readonly text: () => Promise<string>;
}

/** What the upload carries: the file and whether the user confirmed the preview (ADR-0010). */
export interface ImportUploadInput {
  readonly file: SpreadsheetUpload;
  readonly confirm: boolean;
}

/** Far above any planning spreadsheet of 2,000 rows (QS-8); larger uploads are not read at all. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** The file's text; too large or unreadable → `ImportFileInvalid`. */
const readUpload = (file: SpreadsheetUpload) =>
  file.size > MAX_IMPORT_BYTES
    ? Effect.fail(
        new ImportFileInvalid({
          message: `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB`,
        }),
      )
    : Effect.tryPromise({
        try: () => file.text(),
        catch: () => new ImportFileInvalid({ message: 'The file could not be read as text' }),
      });

/** AC-32: fails `ImportAlreadyCompleted` once a run is recorded. */
const requireNoCompletedImport = Effect.flatMap(ImportRunRepository, (runs) =>
  runs.findCompleted(),
).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.void,
      onSome: (run) => Effect.fail(new ImportAlreadyCompleted({ completedAt: run.createdAt })),
    }),
  ),
);

/**
 * Flow 13 (AC-30–AC-33, ADR-0010): the one-time import of the planning spreadsheet. The file is
 * never stored: confirming uploads it again, and everything is recomputed on fresh data.
 *
 * - Missing any import permission → `ImportPermissionsMissing` naming each (AC-33), nothing read.
 * - An import already completed → `ImportAlreadyCompleted` (AC-32).
 * - Unreadable file → `ImportFileInvalid`; problem rows → `ImportProblemRows` (AC-31).
 * - Not confirmed → `ImportConfirmationRequired` carrying the preview (AC-30).
 * - Confirmed → in one unit of work: the org records and teams, the projects, the allocations with
 *   an `imported` history entry each, and the completed run, all stamped with the importing user.
 *   Any failure rolls everything back; a concurrent second import loses on the one-time index.
 */
export const importSpreadsheet = (input: ImportUploadInput) =>
  Effect.gen(function* () {
    yield* requireImportPermissions;
    const actor = yield* changedBy;
    yield* requireNoCompletedImport;
    const text = yield* readUpload(input.file);

    if (!input.confirm) {
      const { preview } = yield* planImport(text);
      return yield* new ImportConfirmationRequired(preview);
    }

    const unitOfWork = yield* UnitOfWork;
    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        // Read again inside the transaction: the plan must hold on the data it commits against.
        yield* requireNoCompletedImport;
        const planned = yield* planImport(text);
        const org = yield* OrgApi;
        const projectsApi = yield* ProjectsApi;
        const allocations = yield* AllocationRepository;
        const history = yield* AllocationHistoryRepository;
        const runs = yield* ImportRunRepository;

        // The plan was checked against AC-20 and the team names a moment ago, in this same
        // transaction: a refusal now is a bug, not a user error.
        const imported = yield* org
          .importRecords({ teams: [], records: planned.records }, actor)
          .pipe(Effect.orDie);
        const employeeIds = new Map<string, EmployeeId>();
        planned.plan.resources.forEach((resource, i) => {
          const record = imported.records[i];
          if (record === undefined)
            throw new Error(`import created no record for row ${resource.firstRow}`);
          employeeIds.set(resource.fullName, record.employeeId);
        });

        const projects = yield* projectsApi.importProjects(planned.projects);
        const projectIds = new Map<string, ProjectId>(
          projects.map((p) => [projectKey(p.name), p.id]),
        );

        const news: NewAllocation[] = planned.allocations.map((allocation) => {
          const employeeId = employeeIds.get(allocation.employee);
          const projectId = projectIds.get(allocation.projectKey);
          if (employeeId === undefined || projectId === undefined) {
            throw new Error(`row ${allocation.row} lost its employee or project`);
          }
          return { employeeId, projectId, segments: [allocation.segment] };
        });
        const ids = yield* allocations.insertMany(news, actor);
        yield* history.appendMany(
          ids.map((allocationId, i) => {
            const created = news[i] as NewAllocation;
            return {
              allocationId,
              employeeId: created.employeeId,
              projectId: created.projectId,
              changedBy: actor,
              entry: new HistoryEntry({
                changeKind: 'imported',
                effectiveFrom: null,
                before: null,
                after: created.segments,
              }),
            };
          }),
        );

        return yield* runs.insert({
          importedBy: actor,
          employeeRecordsCreated: imported.records.length,
          projectsCreated: projects.filter((p) => p.created).length,
          allocationsCreated: ids.length,
        });
      }),
    );
  });

/**
 * `getImportStatus` (AC-32): the completed run, if any. Requires `scheduling:edit-allocations`; the
 * web offers the import only while there is none.
 */
export const getImportStatus = Effect.gen(function* () {
  yield* requirePermission(EDIT_ALLOCATIONS);
  const runs = yield* ImportRunRepository;
  return yield* runs.findCompleted();
});

export type { StoredImportRun };
