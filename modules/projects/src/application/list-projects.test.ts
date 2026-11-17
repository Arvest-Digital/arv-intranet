import { Actor, CurrentActor, Permission, PermissionDenied, UserId } from '@arv/kernel';
import { Effect, Either, type Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { MANAGE_PROJECTS } from '../permissions';
import { pageInOrder } from './page';
import { listProjects, type ProjectListRequest } from './projects';
import { makeProjectsFakes, type ProjectsFakes, TODAY } from './testing';

const VIEW = Permission.make('scheduling:view-whole-board');
const EDIT = Permission.make('scheduling:edit-allocations');
const LEAVE = Permission.make('scheduling:see-leave-reasons');

const user = (...permissions: Permission[]) =>
  Actor.User({
    id: UserId.make('01933b8e-0000-7000-8000-000000000101'),
    permissions: new Set(permissions),
  });

type Services = CurrentActor | Layer.Layer.Success<ProjectsFakes['layer']>;

const list = (fakes: ProjectsFakes, actor: Actor, request: ProjectListRequest = {}) =>
  Effect.runPromise(
    Effect.either(listProjects(request) as Effect.Effect<unknown, unknown, Services>).pipe(
      Effect.provideService(CurrentActor, actor),
      Effect.provide(fakes.layer),
    ),
  );

const names = async (fakes: ProjectsFakes, actor: Actor, request: ProjectListRequest = {}) => {
  const result = await list(fakes, actor, request);
  if (Either.isLeft(result)) throw new Error(`expected a page, got ${String(result.left)}`);
  const page = result.right as { items: Array<{ project: { name: string }; status: string }> };
  return page.items.map((v) => `${v.project.name}:${v.status}`);
};

/** Atlas (open), Borealis (closed yesterday), Sick leave, Zenith (closing today). */
const seeded = () => {
  const fakes = makeProjectsFakes();
  fakes.seedProject('Atlas');
  fakes.seedProject('Borealis', 'internal', '2026-11-15');
  fakes.seedProject('Sick leave', 'leave');
  fakes.seedProject('Zenith', 'client', TODAY);
  return fakes;
};

describe('listProjects (openapi listProjects, AC-25, AC-29)', () => {
  it('lists every project by name with its status today, leave included for a manager', async () => {
    expect(await names(seeded(), user(MANAGE_PROJECTS))).toEqual([
      'Atlas:open',
      'Borealis:closed',
      'Sick leave:open',
      'Zenith:open',
    ]);
  });

  it('leaves leave-type projects out for a board viewer without see-leave-reasons (AC-29)', async () => {
    const fakes = seeded();
    expect(await names(fakes, user(VIEW))).toEqual([
      'Atlas:open',
      'Borealis:closed',
      'Zenith:open',
    ]);
    expect(await names(fakes, user(VIEW), { type: 'leave' })).toEqual([]);
  });

  it.each([
    ['see-leave-reasons', [VIEW, LEAVE]],
    ['edit-allocations (books leave)', [EDIT]],
  ] as const)('offers leave projects to a viewer with %s', async (_, permissions) => {
    expect(await names(seeded(), user(...permissions), { type: 'leave' })).toEqual([
      'Sick leave:open',
    ]);
  });

  it('filters by status today', async () => {
    const fakes = seeded();
    expect(await names(fakes, user(MANAGE_PROJECTS), { status: 'closed' })).toEqual([
      'Borealis:closed',
    ]);
    expect(await names(fakes, user(VIEW), { status: 'open' })).toEqual([
      'Atlas:open',
      'Zenith:open',
    ]);
  });

  it('refuses a user with none of the reader permissions, naming manage-projects', async () => {
    expect(await list(seeded(), user(LEAVE))).toEqual(
      Either.left(new PermissionDenied({ permission: MANAGE_PROJECTS })),
    );
  });
});

describe('pageInOrder', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const ids = (page: { items: ReadonlyArray<{ id: string }> }) => page.items.map((i) => i.id);

  it('cuts the first page and points at the next', () => {
    expect(pageInOrder(items, { limit: 2 })).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      hasNext: true,
      hasPrev: false,
      nextCursor: 'b',
    });
  });

  it('walks forward after a cursor and back before one', () => {
    expect(ids(pageInOrder(items, { after: 'b', limit: 2 }))).toEqual(['c', 'd']);
    const last = pageInOrder(items, { after: 'd', limit: 2 });
    expect(last).toMatchObject({ hasNext: false, hasPrev: true, nextCursor: null });
    expect(ids(pageInOrder(items, { before: 'd', limit: 2 }))).toEqual(['b', 'c']);
  });

  it('answers the first page for a cursor that is not in the list', () => {
    expect(ids(pageInOrder(items, { after: 'zz', limit: 2 }))).toEqual(['a', 'b']);
    expect(ids(pageInOrder(items, { before: 'zz', limit: 2 }))).toEqual(['a', 'b']);
  });
});
