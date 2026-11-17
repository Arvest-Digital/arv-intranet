import { ApiErrorBody } from '@arv/contracts/shared';
import { ProjectId } from '@arv/kernel';
import { toHttpError } from '@arv/platform/http';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CloseDateInPast,
  type ClosingAllocation,
  ClosingConfirmationRequired,
  ProjectClosed,
  ProjectNameTaken,
  ProjectNotFound,
} from '../domain/errors';
import { Project } from '../domain/project';
import { presentProject, presentProjectPage, toProjectsContractError } from './presenter';

// Expected bodies are the OpenAPI examples (openapi.yaml `components.examples`).
const ID = ProjectId.make('01933b8e-0000-7000-8000-000000000501');
const project = new Project({
  id: ID,
  name: 'Test Project',
  type: 'client',
  closeDate: null,
  createdAt: new Date('2026-10-31T09:00:00Z'),
});

const allocation = (n: number, startsOn: string): ClosingAllocation => ({
  allocationId: `01933b8e-0000-7000-8000-00000000060${n}`,
  employee: {
    id: `01933b8e-0000-7000-8000-00000000030${n}`,
    fullName: `Test User ${n}`,
    team: null,
  },
  startsOn,
  endsOn: '2026-12-31',
});

const http = (error: Parameters<typeof toProjectsContractError>[0]) => {
  const { status, body } = toHttpError(toProjectsContractError(error));
  expect(Schema.is(ApiErrorBody)(body)).toBe(true);
  return { status, error: body.error };
};

describe('projects presenter', () => {
  it('presents a project as the OpenAPI example', () => {
    expect(presentProject({ project, status: 'open' })).toEqual({
      id: ID,
      name: 'Test Project',
      type: 'client',
      closeDate: null,
      status: 'open',
      createdAt: '2026-10-31T09:00:00.000Z',
    });
  });

  it('presents a page', () => {
    const page = presentProjectPage({
      items: [{ project, status: 'open' }],
      hasNext: true,
      hasPrev: false,
      nextCursor: ID,
    });
    expect(page).toMatchObject({ hasNext: true, hasPrev: false, nextCursor: ID });
    expect(page.items).toHaveLength(1);
  });

  it('404 projects.project_not_found', () => {
    expect(http(new ProjectNotFound({ id: ID }))).toEqual({
      status: 404,
      error: {
        _tag: 'NotFound',
        code: 'projects.project_not_found',
        message: `Project ${ID} not found`,
      },
    });
  });

  it('409 projects.duplicate_open_name (AC-24)', () => {
    expect(http(new ProjectNameTaken({ name: 'Test Project' }))).toEqual({
      status: 409,
      error: {
        _tag: 'Conflict',
        code: 'projects.duplicate_open_name',
        message: 'An open project named «Test Project» already exists',
      },
    });
  });

  it('400 projects.close_date_in_past (AC-25)', () => {
    expect(http(new CloseDateInPast({ closeDate: '2026-11-01', today: '2026-11-16' }))).toEqual({
      status: 400,
      error: {
        _tag: 'ValidationError',
        code: 'projects.close_date_in_past',
        message: 'The close date cannot be earlier than today; past plans are never rewritten',
        details: { rules: ['close_date_before_today'] },
      },
    });
  });

  it('409 projects.project_closed', () => {
    expect(http(new ProjectClosed({ id: ID, closeDate: '2026-11-01' }))).toEqual({
      status: 409,
      error: {
        _tag: 'Conflict',
        code: 'projects.project_closed',
        message: 'The project is closed and cannot be reopened',
      },
    });
  });

  it('409 projects.closing_confirmation_required listing the trims and removals (AC-25)', () => {
    const ending = [
      allocation(1, '2026-11-02'),
      allocation(3, '2026-11-02'),
      allocation(4, '2026-11-09'),
    ];
    const removed = [allocation(2, '2026-12-07')];
    const result = http(
      new ClosingConfirmationRequired({
        closeDate: '2026-11-30',
        endingAtCloseDate: ending,
        removed,
      }),
    );
    expect(result).toEqual({
      status: 409,
      error: {
        _tag: 'ConfirmationRequired',
        code: 'projects.closing_confirmation_required',
        message: '3 allocations will end on 2026-11-30 and 1 will be removed',
        details: { closeDate: '2026-11-30', endingAtCloseDate: ending, removed },
      },
    });
  });
});
