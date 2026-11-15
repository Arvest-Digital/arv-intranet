import { Actor, type EmployeeId, Permission, type ProjectId } from '@arv/kernel';
import { Data } from 'effect';
import { EDIT_ALLOCATIONS, SEE_LEAVE_REASONS, VIEW_WHOLE_BOARD } from '../permissions';

/**
 * Declared and owned by `org` (sad §8 Authorization); scheduling only reads it to decide who sees
 * employment end dates (AC-22). Repeated here because the domain cannot import `@arv/org`; the key
 * is stable, since a rename would retire it (ADR-0004).
 */
const MANAGE_EMPLOYEE_RECORDS = Permission.make('org:manage-employee-records');

/**
 * Who is looking: the actor's permission set and, when their login is linked to an employee
 * record, that resource. Built per request by the application layer.
 */
export interface Viewer {
  readonly permissions: ReadonlySet<Permission>;
  readonly ownEmployeeId: EmployeeId | null;
}

const NO_PERMISSIONS: ReadonlySet<Permission> = new Set();

/** An anonymous actor holds nothing and is no resource: every check below denies. */
export const viewerOf = (actor: Actor, ownEmployeeId: EmployeeId | null): Viewer =>
  Actor.$match(actor, {
    Anonymous: () => ({ permissions: NO_PERMISSIONS, ownEmployeeId: null }),
    User: ({ permissions }) => ({ permissions, ownEmployeeId }),
  });

const holds = (viewer: Viewer, permission: Permission): boolean =>
  viewer.permissions.has(permission);

const isOwn = (viewer: Viewer, resource: EmployeeId): boolean =>
  viewer.ownEmployeeId !== null && viewer.ownEmployeeId === resource;

/**
 * The board, the free list and allocation history (AC-03). Edit-allocations includes everything
 * view-whole-board allows (AC-12b); this is the one place that rule lives (sad §8).
 */
export const canViewBoard = (viewer: Viewer): boolean =>
  holds(viewer, VIEW_WHOLE_BOARD) || holds(viewer, EDIT_ALLOCATIONS);

/** Create, change and remove allocations and book leave (AC-12). */
export const canEdit = (viewer: Viewer): boolean => holds(viewer, EDIT_ALLOCATIONS);

/** A resource's schedule: everyone's for board viewers, otherwise only the viewer's own (AC-17). */
export const canSeeResource = (viewer: Viewer, resource: EmployeeId): boolean =>
  canViewBoard(viewer) || isOwn(viewer, resource);

/** A leave's type, or only «away»: see-leave-reasons, or the resource's own leave (AC-17, AC-29). */
export const canSeeLeaveType = (viewer: Viewer, resource: EmployeeId): boolean =>
  holds(viewer, SEE_LEAVE_REASONS) || isOwn(viewer, resource);

/**
 * Leave-type projects in the board's project filter (AC-29). No own-resource exception: the filter
 * lists projects across all resources.
 */
export const canFilterByLeaveProjects = (viewer: Viewer): boolean =>
  holds(viewer, SEE_LEAVE_REASONS);

/**
 * A resource's employment end date, the allocations after it and their needing-attention marks
 * (AC-21, AC-22). Not even the resource themselves sees their own end date without one of these:
 * the own-resource exception covers leave type only (PRD §6.1).
 */
export const canSeeEmploymentEnd = (viewer: Viewer): boolean =>
  holds(viewer, MANAGE_EMPLOYEE_RECORDS) || holds(viewer, EDIT_ALLOCATIONS);

/** A project as one viewer may see it next to a resource's hours. */
export type ProjectLabel = Data.TaggedEnum<{
  Project: { readonly projectId: ProjectId; readonly name: string };
  /**
   * Leave whose type the viewer may not see. Carries no project id on purpose: each leave type is
   * its own project, so the id would reveal the type.
   */
  Away: Record<never, never>;
}>;
export const ProjectLabel = Data.taggedEnum<ProjectLabel>();

/** What the policy needs to know about a project; `isLeave` is a leave-type project. */
export interface LabelledProject {
  readonly id: ProjectId;
  readonly name: string;
  readonly isLeave: boolean;
}

/** Leave becomes «away» unless the viewer may see its type; other projects keep their name. */
export const projectLabel = (
  viewer: Viewer,
  resource: EmployeeId,
  project: LabelledProject,
): ProjectLabel =>
  project.isLeave && !canSeeLeaveType(viewer, resource)
    ? ProjectLabel.Away()
    : ProjectLabel.Project({ projectId: project.id, name: project.name });

/** The projects the board's project filter offers this viewer (AC-29). */
export const filterableProjects = <P extends { readonly isLeave: boolean }>(
  viewer: Viewer,
  projects: ReadonlyArray<P>,
): ReadonlyArray<P> =>
  canFilterByLeaveProjects(viewer) ? projects : projects.filter((p) => !p.isLeave);

/**
 * How a resource's employment end (`YYYY-MM-DD`, or `null` while open-ended) shows to a viewer.
 * - `employmentEnd`: the date to send, or `null` when hidden — the viewer cannot tell a hidden end
 *   from no end.
 * - `allocationsUntil`: the last date whose allocations count for this viewer, or `null` for no
 *   cut-off. Hidden ends cut allocations off at the end date, so the weeks after it show zero
 *   capacity with nothing allocated and are never overbooked (AC-22).
 * - `needingAttention`: whether marks on allocations past the end date may be shown (AC-21).
 */
export interface EmploymentEndView {
  readonly employmentEnd: string | null;
  readonly allocationsUntil: string | null;
  readonly needingAttention: boolean;
}

export const employmentEndView = (
  viewer: Viewer,
  employmentEnd: string | null,
): EmploymentEndView =>
  canSeeEmploymentEnd(viewer)
    ? { employmentEnd, allocationsUntil: null, needingAttention: true }
    : { employmentEnd: null, allocationsUntil: employmentEnd, needingAttention: false };
