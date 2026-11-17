import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ApiErrorBody } from '../shared';
import { CloseDateRuleViolations, ProjectClosingImpact } from './errors';
import {
  Project,
  ProjectClose,
  ProjectCreate,
  ProjectIdPath,
  ProjectListQuery,
  ProjectPage,
} from './projects';

// Examples from docs/features/resource-scheduling/contracts/openapi.yaml (components.examples).
const project = {
  id: '01933b8e-0000-7000-8000-000000000501',
  name: 'Test Project',
  type: 'client',
  closeDate: null,
  status: 'open',
  createdAt: '2026-10-31T09:00:00Z',
};
const projectWithCloseDate = { ...project, closeDate: '2026-11-30' };
const projectPage = {
  items: [project],
  hasNext: true,
  hasPrev: false,
  nextCursor: project.id,
};
const closingImpact = {
  closeDate: '2026-11-30',
  endingAtCloseDate: [
    {
      allocationId: '01933b8e-0000-7000-8000-000000000601',
      employee: { id: '01933b8e-0000-7000-8000-000000000301', fullName: 'Test User 1', team: null },
      startsOn: '2026-11-02',
      endsOn: '2026-12-31',
    },
  ],
  removed: [
    {
      allocationId: '01933b8e-0000-7000-8000-000000000602',
      employee: { id: '01933b8e-0000-7000-8000-000000000302', fullName: 'Test User 2', team: null },
      startsOn: '2026-12-07',
      endsOn: '2026-12-31',
    },
  ],
};
const errorExamples = [
  {
    _tag: 'Forbidden',
    code: 'projects.missing_permission',
    message: 'You lack the permission to manage projects',
    details: { missingPermissions: ['projects:manage-projects'] },
  },
  {
    _tag: 'Conflict',
    code: 'projects.duplicate_open_name',
    message: 'An open project named «Test Project» already exists',
  },
  {
    _tag: 'ValidationError',
    code: 'projects.close_date_in_past',
    message: 'The close date cannot be earlier than today; past plans are never rewritten',
    details: { rules: ['close_date_before_today'] },
  },
  {
    _tag: 'NotFound',
    code: 'projects.project_not_found',
    message: 'Project 01933b8e-0000-7000-8000-000000000501 not found',
  },
  {
    _tag: 'Conflict',
    code: 'projects.project_closed',
    message: 'The project is closed and cannot be reopened',
  },
  {
    _tag: 'ConfirmationRequired',
    code: 'projects.closing_confirmation_required',
    message: '3 allocations will end on 2026-11-30 and 1 will be removed',
    details: closingImpact,
  },
];

const decodes = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Either.isRight(Schema.decodeUnknownEither(schema)(value));

describe('projects contracts accept the OpenAPI examples', () => {
  it.each([
    ['Project', Project, project],
    ['Project with a close date', Project, projectWithCloseDate],
    ['ProjectPage', ProjectPage, projectPage],
    ['ProjectCreate', ProjectCreate, { name: 'Test Project', type: 'client' }],
    ['ProjectClose', ProjectClose, { closeDate: '2026-11-30', confirm: false }],
    ['ProjectClosingImpact', ProjectClosingImpact, closingImpact],
    ['CloseDateRuleViolations', CloseDateRuleViolations, { rules: ['close_date_before_today'] }],
  ] as const)('%s', (_, schema, example) => {
    expect(decodes(schema as Schema.Schema<unknown, unknown>, example)).toBe(true);
  });

  it.each(errorExamples)('error $code', (error) => {
    expect(decodes(ApiErrorBody, { error })).toBe(true);
  });
});

describe('projects request rules', () => {
  it('trims a project name, so «Atlas » is «Atlas» (AC-24)', () => {
    expect(Schema.decodeUnknownSync(ProjectCreate)({ name: ' Atlas ', type: 'client' }).name).toBe(
      'Atlas',
    );
  });

  it.each([
    ['a blank name', { name: '   ', type: 'client' }],
    ['no type', { name: 'Atlas' }],
    ['an unknown type', { name: 'Atlas', type: 'other' }],
    ['an unknown field', { name: 'Atlas', type: 'client', closeDate: null }],
    ['a 201-character name', { name: 'x'.repeat(201), type: 'client' }],
  ])('ProjectCreate refuses %s', (_, body) => {
    expect(decodes(ProjectCreate, body)).toBe(false);
  });

  it('ProjectClose defaults confirm to false', () => {
    expect(Schema.decodeUnknownSync(ProjectClose)({ closeDate: '2026-11-30' })).toEqual({
      closeDate: '2026-11-30',
      confirm: false,
    });
  });

  it.each([
    ['no close date', {}],
    ['a date that is not a day', { closeDate: '2026-02-30' }],
    ['an unknown field', { closeDate: '2026-11-30', reopen: true }],
  ])('ProjectClose refuses %s', (_, body) => {
    expect(decodes(ProjectClose, body)).toBe(false);
  });

  it('the list query takes a status, a type and a page, never after and before together', () => {
    expect(
      Schema.decodeUnknownSync(ProjectListQuery)({ status: 'open', type: 'leave', limit: '20' }),
    ).toEqual({ status: 'open', type: 'leave', limit: 20 });
    expect(decodes(ProjectListQuery, { status: 'archived' })).toBe(false);
    expect(decodes(ProjectListQuery, { after: project.id, before: project.id })).toBe(false);
  });

  it('the path takes a uuid', () => {
    expect(decodes(ProjectIdPath, { projectId: project.id })).toBe(true);
    expect(decodes(ProjectIdPath, { projectId: '42' })).toBe(false);
  });
});
