import type {
  ImportPreview,
  ImportProblemReason,
  ImportResult,
  ImportStatus,
} from '@arv/contracts/scheduling';

// The import screen's model (T43, US-11, flow 13): what its loader and action answer, and the
// words it uses for problem rows and missing permissions (AC-30–AC-33).

/** The three permissions the import needs: it creates records in three modules (AC-33). */
export const IMPORT_PERMISSIONS = [
  'scheduling:edit-allocations',
  'org:manage-employee-records',
  'projects:manage-projects',
] as const;

/** Each import permission as a sentence names it. */
export const PERMISSION_NAME: Record<string, string> = {
  'scheduling:edit-allocations': 'edit allocations',
  'org:manage-employee-records': 'manage employee records',
  'projects:manage-projects': 'manage projects',
};

/** «edit allocations, manage projects». */
export const permissionNames = (missing: ReadonlyArray<string>) =>
  missing.map((p) => PERMISSION_NAME[p] ?? p).join(', ');

/** What the import page's loader answers. */
export type ImportPageData =
  | { readonly kind: 'status'; readonly status: ImportStatus }
  /** AC-33: every import permission the user lacks. */
  | { readonly kind: 'perms'; readonly missing: ReadonlyArray<string> };

/** A problem row as the table shows it (AC-31). */
export type ProblemRow = {
  readonly row: number;
  readonly reason: ImportProblemReason;
  readonly message: string;
};

/** What the import action answers the page. */
export type ImportActionResult =
  /** Confirmed: the run (AC-30). */
  | { readonly kind: 'success'; readonly run: ImportResult }
  /** A clean file, nothing saved: what confirming would create (AC-30). */
  | { readonly kind: 'preview'; readonly preview: ImportPreview }
  /** Nothing saved: the rows to fix (AC-31). */
  | { readonly kind: 'problems'; readonly rows: ReadonlyArray<ProblemRow> }
  /** The import ran already (AC-32). */
  | { readonly kind: 'completed'; readonly completedAt: Date | null }
  /** AC-33. */
  | { readonly kind: 'perms'; readonly missing: ReadonlyArray<string> }
  /** The file can't be read: not a CSV, too large, a header missing, … */
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export const PROBLEM_LABEL: Record<ImportProblemReason, string> = {
  empty_hours: 'Empty hours',
  end_before_start: 'End date before start date',
  similar_name: 'Looks like the same person',
  invalid_allocation: 'Invalid allocation',
  outside_employment_period: 'Outside the employment period',
  invalid_employee_record: 'Invalid employee record',
};

export const IMPORT_MESSAGE = {
  noFile: 'Choose the planning spreadsheet to upload.',
  /** The api's limit (ADR-0010). */
  maxBytes: 5 * 1024 * 1024,
  tooLarge: 'The file is larger than 5 MB.',
} as const;

/** «248 KB», «1.2 MB». */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** «1 row», «3 rows». */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
