import { Actor, CurrentActor, type Permission, Today, Unauthenticated } from '@arv/kernel';
import {
  EmployeeName,
  type ImportedEmployeeRecord,
  type IsoWeekday,
  MANAGE_EMPLOYEE_RECORDS,
  OrgApi,
  TeamName,
  validateEmployeeTerms,
} from '@arv/org';
import { type ImportedProject, MANAGE_PROJECTS, ProjectName, ProjectsApi } from '@arv/projects';
import { Effect, Either, Option, Schema } from 'effect';
import type { IsoDate } from '../domain/allocation';
import {
  ImportPermissionsMissing,
  type ImportProblemRow,
  ImportProblemRows,
} from '../domain/errors';
import {
  checkImport,
  type ImportAllocation,
  type ImportPlan,
  type ImportResource,
  type ImportWeekOver,
  importWindow,
  readImportFile,
  sortProblems,
} from '../domain/import-rows';
import { EDIT_ALLOCATIONS } from '../permissions';

/** The import creates records in three modules, so it needs all three permissions (AC-33). */
export const IMPORT_PERMISSIONS: ReadonlyArray<Permission> = [
  EDIT_ALLOCATIONS,
  MANAGE_EMPLOYEE_RECORDS,
  MANAGE_PROJECTS,
];

/**
 * AC-33: succeeds only when the current actor holds every import permission; otherwise fails
 * `ImportPermissionsMissing` naming each one missing. Nothing is read before this check.
 */
export const requireImportPermissions = Effect.flatMap(
  CurrentActor,
  Actor.$match({
    Anonymous: () => Effect.fail(new Unauthenticated({})),
    User: ({ permissions }) => {
      const [first, ...rest] = IMPORT_PERMISSIONS.filter((p) => !permissions.has(p));
      return first === undefined
        ? Effect.void
        : Effect.fail(new ImportPermissionsMissing({ missing: [first, ...rest] }));
    },
  }),
);

/** The preview shown before the one confirmation (contract `ImportPreview`, AC-30). */
export interface ImportPreview {
  readonly employeeRecordsToCreate: number;
  readonly projectsToCreate: number;
  readonly allocationsToCreate: number;
  /** Records still incomplete after the import: no contract hours or no start (AC-06). */
  readonly incompleteRecords: number;
  /** By full name, then week. */
  readonly overbookedWeeks: ReadonlyArray<ImportWeekOver>;
}

/**
 * A clean spreadsheet, ready to commit (T35): the preview plus the commands' inputs, already
 * checked. `records[i]` is `plan.resources[i]`; allocations name their resource by full name and
 * their project by name key, which the commit resolves against the commands' results.
 */
export interface PlannedImport {
  readonly preview: ImportPreview;
  readonly plan: ImportPlan;
  /** For `OrgApi.importRecords`, aligned with `plan.resources`. */
  readonly records: ReadonlyArray<ImportedEmployeeRecord>;
  /** For `ProjectsApi.importProjects`: every project named, reused or created. */
  readonly projects: ReadonlyArray<ImportedProject>;
  readonly allocations: ReadonlyArray<ImportAllocation>;
}

const decode = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Schema.decodeUnknownEither(schema)(value);

/**
 * AC-20 and the name limits on each record the import creates, reported on the first row naming the
 * employee. The rules are `org`'s (`validateEmployeeTerms`), so they match manual entry exactly.
 */
const recordProblems = (
  resource: ImportResource,
): { problems: ImportProblemRow[]; record: ImportedEmployeeRecord | null } => {
  const problems: ImportProblemRow[] = [];
  const at = (reason: ImportProblemRow['reason'], message: string) =>
    problems.push({ row: resource.firstRow, reason, message });

  const fullName = decode(EmployeeName, resource.fullName);
  if (Either.isLeft(fullName))
    at('invalid_employee_record', 'Employee name is longer than 200 characters');
  const teamName =
    resource.teamName === null ? Either.right(null) : decode(TeamName, resource.teamName);
  if (Either.isLeft(teamName))
    at('invalid_employee_record', `Team name of «${resource.fullName}» is too long`);

  const terms = validateEmployeeTerms({
    contractMinutes: resource.contractMinutes,
    workingDays: (resource.workingDays as ReadonlyArray<IsoWeekday> | null) ?? undefined,
    employmentStart: resource.employmentStart,
    employmentEnd: resource.employmentEnd,
  });
  if (Either.isLeft(terms)) {
    for (const violation of terms.left.violations) {
      switch (violation._tag) {
        case 'ContractHoursOutOfRange':
          at(
            'invalid_employee_record',
            `Contract hours of «${resource.fullName}» must be above 0 and at most 60 a week, in whole minutes`,
          );
          break;
        case 'NoWorkingDay':
          at('invalid_employee_record', `«${resource.fullName}» has no working day`);
          break;
        case 'EmploymentEndsBeforeStart':
          at(
            'end_before_start',
            `Employment end ${violation.employmentEnd} of «${resource.fullName}» is before its start ${violation.employmentStart}`,
          );
          break;
      }
    }
  }

  if (Either.isLeft(fullName) || Either.isLeft(teamName) || Either.isLeft(terms)) {
    return { problems, record: null };
  }
  return {
    problems,
    record: {
      fullName: fullName.right,
      teamName: teamName.right,
      contractMinutes: terms.right.contractMinutes,
      workingDays: terms.right.workingDays,
      employmentStart: terms.right.employmentStart,
      employmentEnd: terms.right.employmentEnd,
    },
  };
};

/**
 * Flow 13 up to the preview (AC-30, AC-31, AC-33): reads the spreadsheet `text` (CSV, see
 * `domain/import-rows.ts` for the assumed format) and checks every row against the manual-entry
 * rules, existing employee records and open projects. Stores nothing and opens no unit of work.
 *
 * - Missing any import permission → `ImportPermissionsMissing` naming all missing, nothing read.
 * - Unreadable file, missing column, no rows, too many → `ImportFileInvalid`.
 * - Any problem row → `ImportProblemRows` with every problem, in row order (AC-31).
 * - Otherwise the counts, incomplete records and overbooked resource-weeks, with the checked
 *   commands' inputs for the commit (T35). Overbooking is shown, never refused (AC-30).
 *
 * Whether an import already completed (AC-32) is the caller's check (T35).
 */
export const planImport = (text: string) =>
  Effect.gen(function* () {
    yield* requireImportPermissions;
    const read = yield* readImportFile(text);
    const today = (yield* (yield* Today).date) as IsoDate;
    const org = yield* OrgApi;
    const projectsApi = yield* ProjectsApi;

    const window = Option.getOrElse(importWindow(read.rows), () => ({ from: today, to: today }));
    const existing = yield* org.allResources(window);
    const openProjects = yield* projectsApi.listOpenOn(today);

    const check = checkImport(read, {
      today,
      employeeNames: existing.resources.map((r) => r.fullName),
      openProjects: openProjects.map((p) => ({
        name: p.name,
        type: p.type,
        closeDate: p.closeDate,
      })),
      holidays: new Set(existing.holidays.map((h) => h.holidayDate)),
    });

    const problems = [...check.problems];
    const records: ImportedEmployeeRecord[] = [];
    for (const resource of check.plan.resources) {
      const checked = recordProblems(resource);
      problems.push(...checked.problems);
      if (checked.record !== null) records.push(checked.record);
    }
    const projects: ImportedProject[] = [];
    for (const project of check.plan.projects) {
      const name = decode(ProjectName, project.name);
      if (Either.isLeft(name)) {
        problems.push({
          row: project.firstRow,
          reason: 'invalid_allocation',
          message: 'Project name is longer than 200 characters',
        });
      } else {
        projects.push({ name: name.right, type: project.type });
      }
    }

    const [first, ...rest] = sortProblems(problems);
    if (first !== undefined) return yield* new ImportProblemRows({ rows: [first, ...rest] });

    const preview: ImportPreview = {
      employeeRecordsToCreate: check.plan.resources.length,
      projectsToCreate: check.plan.projects.filter((p) => p.created).length,
      allocationsToCreate: check.plan.allocations.length,
      incompleteRecords: records.filter(
        (r) => r.contractMinutes === null || r.employmentStart === null,
      ).length,
      overbookedWeeks: check.overbookedWeeks,
    };
    const planned: PlannedImport = {
      preview,
      plan: check.plan,
      records,
      projects,
      allocations: check.plan.allocations,
    };
    return planned;
  });

/** The preview of `text` (AC-30); see `planImport` for the failures. */
export const previewImport = (text: string) =>
  Effect.map(planImport(text), (planned) => planned.preview);
