import { type EmployeeId, Today, type UserId } from '@arv/kernel';
import { OrgApi } from '@arv/org';
import { type ProjectInfo, ProjectsApi } from '@arv/projects';
import { Effect, Equal } from 'effect';
import { type AllocationId, type ChangeKind, type IsoDate, Segment } from '../domain/allocation';
import { employmentEndView, ProjectLabel, projectLabel } from '../domain/visibility';
import { monthsBefore } from './board';
import { type PageRequest, pageInOrder } from './page';
import { AllocationHistoryRepository, type StoredHistoryEntry } from './ports';
import { requireBoardViewer, withOwnEmployee } from './viewer';

/** How far back an allocation's history goes (AC-16); older entries are purged monthly. */
export const HISTORY_MONTHS = 12;

/** One change to an allocation, already redacted for the viewer (AC-16, AC-22, AC-29). */
export interface AllocationHistoryItem {
  readonly id: string;
  readonly allocationId: AllocationId;
  readonly employeeId: EmployeeId;
  /** `null` for leave whose type the viewer may not see: only «away» (AC-29). */
  readonly project: ProjectInfo | null;
  readonly away: boolean;
  readonly changeKind: ChangeKind;
  /** The first day the change applies to; `null` for `created` and `imported`. */
  readonly effectiveFrom: IsoDate | null;
  /** Segments before the change; `null` for `created` and `imported`. */
  readonly before: ReadonlyArray<Segment> | null;
  /** Segments after the change; `null` for `removed`. */
  readonly after: ReadonlyArray<Segment> | null;
  /** Who made the change: for a trim the user who closed the project, for an import the importer. */
  readonly changedBy: UserId;
  /** When the change was made. */
  readonly changedAt: Date;
}

/** Segments as a viewer may see them: cut at a hidden employment end (AC-22). */
const cutAt = (
  segments: ReadonlyArray<Segment> | null,
  until: IsoDate | null,
): ReadonlyArray<Segment> | null =>
  segments === null || until === null
    ? segments
    : segments
        .filter((s) => s.startsOn <= until)
        .map((s) => (s.endsOn <= until ? s : new Segment({ ...s, endsOn: until })));

const isEmpty = (segments: ReadonlyArray<Segment> | null) =>
  segments === null || segments.length === 0;

const sameSegments = (a: ReadonlyArray<Segment> | null, b: ReadonlyArray<Segment> | null) =>
  a !== null &&
  b !== null &&
  a.length === b.length &&
  a.every((segment, i) => Equal.equals(segment, b[i]));

/**
 * Flow 7: an allocation's change history over the last 12 months, oldest first (AC-07a, AC-12b,
 * AC-16, AC-22, AC-29).
 *
 * - Neither view-whole-board nor edit-allocations → `PermissionDenied`, nothing read (AC-12b).
 * - Every entry recorded in the last 12 months: creation or «imported», changes, trims (by the
 *   user who closed the project) and the removal, with who, when and the values before and after.
 *   Works after the allocation was deleted; an unknown id gives no entries.
 * - Leave shows as «away» without its project unless the viewer may see its type (AC-29).
 * - Past an employment end the viewer may not see, values are cut at the end and changes that only
 *   touch the days after it are left out, so the end does not leak (AC-22).
 */
export const getAllocationHistory = (allocationId: AllocationId) =>
  Effect.gen(function* () {
    const boardViewer = yield* requireBoardViewer;
    const today = yield* (yield* Today).date;
    const history = yield* AllocationHistoryRepository;
    const since = new Date(`${monthsBefore(today, HISTORY_MONTHS)}T00:00:00Z`);
    const entries = [...(yield* history.listForAllocation(allocationId, since))].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    if (entries.length === 0) return [] as ReadonlyArray<AllocationHistoryItem>;

    const viewer = yield* withOwnEmployee(boardViewer);
    const org = yield* OrgApi;
    const projectsApi = yield* ProjectsApi;
    const employeeIds = [...new Set(entries.map((e) => e.employeeId))];
    const { resources } = yield* org.employmentTerms(employeeIds, { from: today, to: today });
    const projectList = yield* projectsApi.listByIds([...new Set(entries.map((e) => e.projectId))]);
    const projects = new Map(projectList.map((p) => [p.id, p]));
    const ends = new Map(resources.map((r) => [r.employeeId, r.employmentEnd]));

    const redact = (stored: StoredHistoryEntry): ReadonlyArray<AllocationHistoryItem> => {
      const project = projects.get(stored.projectId);
      // No foreign key across modules, but projects are never deleted: a missing one is a defect.
      if (project === undefined) {
        throw new Error(`history references unknown project ${stored.projectId}`);
      }
      const until = employmentEndView(viewer, ends.get(stored.employeeId) ?? null).allocationsUntil;
      const { entry } = stored;
      const before = cutAt(entry.before, until);
      const after = cutAt(entry.after, until);
      // A change made today can still touch only days past the end: once cut, before and after
      // are the same, and showing it would reveal that something after the end was edited.
      const afterHiddenEnd =
        until !== null &&
        ((entry.effectiveFrom !== null && entry.effectiveFrom > until) ||
          sameSegments(before, after));
      if (afterHiddenEnd || (isEmpty(before) && isEmpty(after))) return [];
      const label = projectLabel(viewer, stored.employeeId, {
        id: project.id,
        name: project.name,
        isLeave: project.type === 'leave',
      });
      return [
        {
          id: stored.id,
          allocationId: stored.allocationId,
          employeeId: stored.employeeId,
          project: ProjectLabel.$is('Away')(label) ? null : project,
          away: project.type === 'leave',
          changeKind: entry.changeKind,
          effectiveFrom: entry.effectiveFrom,
          before,
          after,
          changedBy: stored.changedBy,
          changedAt: stored.createdAt,
        },
      ];
    };
    const items: ReadonlyArray<AllocationHistoryItem> = entries.flatMap(redact);
    return items;
  });

/**
 * `listAllocationHistory`: one cursor page of `getAllocationHistory`, oldest first, with an
 * entry's id as the cursor. An unknown id gives an empty page.
 */
export const listAllocationHistory = (allocationId: AllocationId, page: PageRequest = {}) =>
  getAllocationHistory(allocationId).pipe(Effect.map((items) => pageInOrder(items, page)));
