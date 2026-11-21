import { Actor, EmployeeId, Permission, ProjectId, UserId } from '@arv/kernel';
import { describe, expect, it } from 'vitest';
import {
  canEdit,
  canFilterByLeaveProjects,
  canSeeEmploymentEnd,
  canSeeLeaveType,
  canSeeResource,
  canViewBoard,
  employmentEndView,
  filterableProjects,
  projectLabel,
  type Viewer,
  viewerOf,
} from './visibility';

const V = Permission.make('scheduling:view-whole-board');
const E = Permission.make('scheduling:edit-allocations');
const L = Permission.make('scheduling:see-leave-reasons');
const M = Permission.make('org:manage-employee-records');
// Granted to everyone in the table: permissions scheduling does not read change nothing.
const UNRELATED = [
  Permission.make('identity:manage-access'),
  Permission.make('projects:manage-projects'),
  Permission.make('org:manage-holiday-list'),
];

const self = EmployeeId.make('018f0000-0000-7000-8000-000000000001');
const other = EmployeeId.make('018f0000-0000-7000-8000-000000000002');
const userId = UserId.make('018f0000-0000-7000-8000-0000000000aa');

const sickLeave = {
  id: ProjectId.make('018f0000-0000-7000-8000-0000000000b1'),
  name: 'Sick leave',
  isLeave: true,
};
const clientWork = {
  id: ProjectId.make('018f0000-0000-7000-8000-0000000000b2'),
  name: 'Client work',
  isLeave: false,
};

const viewer = (permissions: ReadonlyArray<Permission>): Viewer => ({
  permissions: new Set([...permissions, ...UNRELATED]),
  ownEmployeeId: self,
});

/**
 * Every combination of the four permissions the policy reads. Columns: board (AC-03, AC-12b),
 * edit, other resource visible (AC-17), leave type on own / other resource (AC-17, AC-29),
 * leave projects in the filter (AC-29), employment end with later allocations and marks (AC-22).
 */
const matrix: ReadonlyArray<{
  readonly holds: ReadonlyArray<Permission>;
  readonly board: boolean;
  readonly edit: boolean;
  readonly seeOther: boolean;
  readonly leaveOwn: boolean;
  readonly leaveOther: boolean;
  readonly leaveFilter: boolean;
  readonly end: boolean;
}> = [
  {
    holds: [],
    board: false,
    edit: false,
    seeOther: false,
    leaveOwn: true,
    leaveOther: false,
    leaveFilter: false,
    end: false,
  },
  {
    holds: [V],
    board: true,
    edit: false,
    seeOther: true,
    leaveOwn: true,
    leaveOther: false,
    leaveFilter: false,
    end: false,
  },
  {
    holds: [E],
    board: true,
    edit: true,
    seeOther: true,
    leaveOwn: true,
    leaveOther: false,
    leaveFilter: false,
    end: true,
  },
  {
    holds: [L],
    board: false,
    edit: false,
    seeOther: false,
    leaveOwn: true,
    leaveOther: true,
    leaveFilter: true,
    end: false,
  },
  {
    holds: [M],
    board: false,
    edit: false,
    seeOther: false,
    leaveOwn: true,
    leaveOther: false,
    leaveFilter: false,
    end: true,
  },
  {
    holds: [V, E],
    board: true,
    edit: true,
    seeOther: true,
    leaveOwn: true,
    leaveOther: false,
    leaveFilter: false,
    end: true,
  },
  {
    holds: [V, L],
    board: true,
    edit: false,
    seeOther: true,
    leaveOwn: true,
    leaveOther: true,
    leaveFilter: true,
    end: false,
  },
  {
    holds: [V, M],
    board: true,
    edit: false,
    seeOther: true,
    leaveOwn: true,
    leaveOther: false,
    leaveFilter: false,
    end: true,
  },
  {
    holds: [E, L],
    board: true,
    edit: true,
    seeOther: true,
    leaveOwn: true,
    leaveOther: true,
    leaveFilter: true,
    end: true,
  },
  {
    holds: [E, M],
    board: true,
    edit: true,
    seeOther: true,
    leaveOwn: true,
    leaveOther: false,
    leaveFilter: false,
    end: true,
  },
  {
    holds: [L, M],
    board: false,
    edit: false,
    seeOther: false,
    leaveOwn: true,
    leaveOther: true,
    leaveFilter: true,
    end: true,
  },
  {
    holds: [V, E, L],
    board: true,
    edit: true,
    seeOther: true,
    leaveOwn: true,
    leaveOther: true,
    leaveFilter: true,
    end: true,
  },
  {
    holds: [V, E, M],
    board: true,
    edit: true,
    seeOther: true,
    leaveOwn: true,
    leaveOther: false,
    leaveFilter: false,
    end: true,
  },
  {
    holds: [V, L, M],
    board: true,
    edit: false,
    seeOther: true,
    leaveOwn: true,
    leaveOther: true,
    leaveFilter: true,
    end: true,
  },
  {
    holds: [E, L, M],
    board: true,
    edit: true,
    seeOther: true,
    leaveOwn: true,
    leaveOther: true,
    leaveFilter: true,
    end: true,
  },
  {
    holds: [V, E, L, M],
    board: true,
    edit: true,
    seeOther: true,
    leaveOwn: true,
    leaveOther: true,
    leaveFilter: true,
    end: true,
  },
];

const label = (holds: ReadonlyArray<Permission>) =>
  holds.length === 0 ? 'none' : holds.map((p) => p.split(':')[1]).join(' + ');

describe('visibility policy, every permission combination × {own, other} resource', () => {
  it('covers all 16 combinations', () => {
    expect(new Set(matrix.map((row) => label(row.holds))).size).toBe(16);
  });

  describe.each(matrix.map((row) => [label(row.holds), row] as const))('%s', (_, row) => {
    const v = viewer(row.holds);

    it('board and edit (AC-03, AC-12b)', () => {
      expect(canViewBoard(v)).toBe(row.board);
      expect(canEdit(v)).toBe(row.edit);
    });

    it('own schedule always, others only with the board (AC-17)', () => {
      expect(canSeeResource(v, self)).toBe(true);
      expect(canSeeResource(v, other)).toBe(row.seeOther);
    });

    it('leave type or «away» (AC-17, AC-29)', () => {
      expect(canSeeLeaveType(v, self)).toBe(row.leaveOwn);
      expect(canSeeLeaveType(v, other)).toBe(row.leaveOther);
      const typed = { _tag: 'Project', projectId: sickLeave.id, name: 'Sick leave' };
      const away = { _tag: 'Away' };
      expect(projectLabel(v, self, sickLeave)).toEqual(row.leaveOwn ? typed : away);
      expect(projectLabel(v, other, sickLeave)).toEqual(row.leaveOther ? typed : away);
    });

    it('work projects keep their name for everyone', () => {
      for (const resource of [self, other]) {
        expect(projectLabel(v, resource, clientWork)).toEqual({
          _tag: 'Project',
          projectId: clientWork.id,
          name: 'Client work',
        });
      }
    });

    it('leave projects in the project filter (AC-29)', () => {
      expect(canFilterByLeaveProjects(v)).toBe(row.leaveFilter);
      expect(filterableProjects(v, [clientWork, sickLeave])).toEqual(
        row.leaveFilter ? [clientWork, sickLeave] : [clientWork],
      );
    });

    it('employment end, later allocations and needing-attention marks (AC-22)', () => {
      expect(canSeeEmploymentEnd(v)).toBe(row.end);
      expect(employmentEndView(v, '2026-12-15')).toEqual(
        row.end
          ? { employmentEnd: '2026-12-15', allocationsUntil: null, needingAttention: true }
          : { employmentEnd: null, allocationsUntil: '2026-12-15', needingAttention: false },
      );
    });
  });
});

describe('employmentEndView with no end date', () => {
  it('has no end to show and no cut-off for anyone', () => {
    for (const holds of [[], [E], [M]]) {
      const view = employmentEndView(viewer(holds), null);
      expect(view.employmentEnd).toBeNull();
      expect(view.allocationsUntil).toBeNull();
    }
  });
});

describe('viewerOf', () => {
  it('denies everything to an anonymous actor, even with a linked resource', () => {
    const v = viewerOf(Actor.Anonymous(), self);
    expect(v.permissions.size).toBe(0);
    expect(v.ownEmployeeId).toBeNull();
    expect(canViewBoard(v)).toBe(false);
    expect(canSeeResource(v, self)).toBe(false);
    expect(canSeeLeaveType(v, self)).toBe(false);
  });

  it("carries a user's permissions and own resource", () => {
    const v = viewerOf(Actor.User({ id: userId, permissions: new Set([V]) }), self);
    expect(canViewBoard(v)).toBe(true);
    expect(canSeeLeaveType(v, self)).toBe(true);
    expect(canSeeLeaveType(v, other)).toBe(false);
  });

  it('a user not linked to any resource has no own leave exception', () => {
    const v = viewerOf(Actor.User({ id: userId, permissions: new Set() }), null);
    expect(canSeeResource(v, self)).toBe(false);
    expect(canSeeLeaveType(v, self)).toBe(false);
  });
});
