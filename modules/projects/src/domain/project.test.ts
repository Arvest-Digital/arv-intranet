import { ProjectId } from '@arv/kernel';
import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { CloseDateInPast, ProjectClosed } from './errors';
import {
  closeProject,
  ensureOpenOn,
  isOpenOn,
  PROJECT_NAME_MAX_LENGTH,
  Project,
  ProjectName,
  projectNameKey,
} from './project';

const ID = ProjectId.make('0190a0b0-0000-7000-8000-000000000001');

const project = (closeDate: string | null) =>
  new Project({
    id: ID,
    name: 'Atlas',
    type: 'client',
    closeDate,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });

describe('Project', () => {
  it.each(['client', 'internal', 'bench', 'training', 'leave'] as const)(
    'accepts the %s type',
    (type) => {
      expect(new Project({ ...project(null), type }).type).toBe(type);
    },
  );

  it('rejects an unknown type', () => {
    expect(() => new Project({ ...project(null), type: 'other' as 'client' })).toThrow();
  });

  it.each(['2026-13-01', '2026-1-1', '15.11.2026', ''])('rejects the close date %j', (date) => {
    expect(() => project(date)).toThrow();
  });
});

describe('isOpenOn (AC-25, AC-11)', () => {
  it.each([
    { closeDate: null, date: '2099-12-31', open: true },
    { closeDate: '2026-11-20', date: '2026-11-19', open: true },
    { closeDate: '2026-11-20', date: '2026-11-20', open: true },
    { closeDate: '2026-11-20', date: '2026-11-21', open: false },
    { closeDate: '2026-11-30', date: '2026-12-01', open: false },
  ])('close date $closeDate is open on $date: $open', ({ closeDate, date, open }) => {
    expect(isOpenOn(project(closeDate), date)).toBe(open);
    expect(Either.isRight(ensureOpenOn(project(closeDate), date))).toBe(open);
  });

  it('refuses a project closed on the date with ProjectClosed (AC-11)', () => {
    expect(ensureOpenOn(project('2026-11-20'), '2026-11-21')).toEqual(
      Either.left(new ProjectClosed({ id: ID, closeDate: '2026-11-20' })),
    );
  });
});

describe('closeProject (AC-25)', () => {
  const today = '2026-11-15';

  it.each(['2026-11-15', '2026-11-16', '2027-03-31'])('sets the close date %s', (closeDate) => {
    const closed = closeProject(project(null), closeDate, today);
    expect(Either.getOrThrow(closed).closeDate).toBe(closeDate);
  });

  it('refuses a close date before today with CloseDateInPast', () => {
    expect(closeProject(project(null), '2026-11-14', today)).toEqual(
      Either.left(new CloseDateInPast({ closeDate: '2026-11-14', today })),
    );
  });

  it('moves the close date of a project that is still open', () => {
    const closed = closeProject(project(today), '2026-12-01', today);
    expect(Either.getOrThrow(closed).closeDate).toBe('2026-12-01');
  });

  it('refuses to reopen or re-close a project that is already closed', () => {
    expect(closeProject(project('2026-11-14'), '2026-12-01', today)).toEqual(
      Either.left(new ProjectClosed({ id: ID, closeDate: '2026-11-14' })),
    );
  });
});

describe('project names (AC-24)', () => {
  it.each([
    ['Atlas', 'atlas '],
    ['Atlas', ' ATLAS'],
    ['Annual leave', 'annual Leave'],
  ])('%j and %j share a key', (a, b) => {
    expect(projectNameKey(a)).toBe(projectNameKey(b));
  });

  it('keeps different names apart', () => {
    expect(projectNameKey('Atlas')).not.toBe(projectNameKey('Atlas 2'));
  });

  it('trims the name when decoding', () => {
    expect(Schema.decodeUnknownSync(ProjectName)('  Atlas ')).toBe('Atlas');
  });

  it.each(['', '   ', 'a'.repeat(PROJECT_NAME_MAX_LENGTH + 1)])('rejects the name %j', (raw) => {
    expect(Either.isLeft(Schema.decodeUnknownEither(ProjectName)(raw))).toBe(true);
  });

  it('accepts a name of exactly 200 characters', () => {
    const name = 'a'.repeat(PROJECT_NAME_MAX_LENGTH);
    expect(Schema.decodeUnknownSync(ProjectName)(name)).toBe(name);
  });
});
