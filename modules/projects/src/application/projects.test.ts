import {
  Actor,
  CurrentActor,
  PermissionDenied,
  ProjectId,
  Unauthenticated,
  UserId,
} from '@arv/kernel';
import { Effect, Either, type Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CloseDateInPast,
  type ClosingAllocation,
  ClosingConfirmationRequired,
  ProjectClosed,
  ProjectNameTaken,
  ProjectNotFound,
} from '../domain/errors';
import { ProjectName } from '../domain/project';
import { MANAGE_PROJECTS } from '../permissions';
import { closeProject, createProject } from './projects';
import { makeProjectsFakes, type ProjectsFakes, TODAY } from './testing';

const projectName = Schema.decodeSync(ProjectName);
const closer = UserId.make('01933b8e-0000-7000-8000-000000000101');
const manager = Actor.User({ id: closer, permissions: new Set([MANAGE_PROJECTS]) });
const viewer = Actor.User({ id: closer, permissions: new Set() });

type Services = CurrentActor | Layer.Layer.Success<ProjectsFakes['layer']>;

const run = <A, E>(fakes: ProjectsFakes, actor: Actor, effect: Effect.Effect<A, E, Services>) =>
  Effect.runPromise(
    Effect.either(effect).pipe(
      Effect.provideService(CurrentActor, actor),
      Effect.provide(fakes.layer),
    ),
  );

const right = <A, E>(result: Either.Either<A, E>): A => {
  if (Either.isLeft(result))
    throw new Error(`expected success, got ${JSON.stringify(result.left)}`);
  return result.right;
};

const left = <A, E>(result: Either.Either<A, E>): E => {
  if (Either.isRight(result)) throw new Error('expected a failure, got success');
  return result.left;
};

const allocation = (n: number, startsOn: string, endsOn: string): ClosingAllocation => ({
  allocationId: `01933b8e-0000-7000-8000-00000000060${n}`,
  employee: {
    id: `01933b8e-0000-7000-8000-00000000030${n}`,
    fullName: `Test User ${n}`,
    team: null,
  },
  startsOn,
  endsOn,
});

describe('createProject (AC-23, AC-24, AC-26)', () => {
  it('records a client project as open (AC-23)', async () => {
    const fakes = makeProjectsFakes();

    const created = right(
      await run(fakes, manager, createProject({ name: projectName('Atlas'), type: 'client' })),
    );

    expect(created).toMatchObject({ name: 'Atlas', type: 'client', closeDate: null });
    expect(fakes.project(created.id)).toEqual(created);
  });

  it('refuses «atlas » next to an open «Atlas» (AC-24)', async () => {
    const fakes = makeProjectsFakes();
    fakes.seedProject('Atlas');
    const before = fakes.snapshot();

    // Decoding trims the display form; the name key also ignores case.
    const error = left(
      await run(fakes, manager, createProject({ name: projectName('atlas '), type: 'internal' })),
    );

    expect(error).toEqual(new ProjectNameTaken({ name: 'atlas' }));
    expect(fakes.snapshot()).toEqual(before);
  });

  it('accepts the name of a project closed before today', async () => {
    const fakes = makeProjectsFakes();
    fakes.seedProject('Atlas', 'client', '2026-11-15');

    const created = right(
      await run(fakes, manager, createProject({ name: projectName('Atlas'), type: 'client' })),
    );
    expect(created.closeDate).toBeNull();
  });

  it('still refuses the name of a project closing today: it is open until the end of the day', async () => {
    const fakes = makeProjectsFakes();
    fakes.seedProject('Atlas', 'client', TODAY);

    const error = left(
      await run(fakes, manager, createProject({ name: projectName('Atlas'), type: 'client' })),
    );
    expect(error).toBeInstanceOf(ProjectNameTaken);
  });

  it('refuses a user without manage-projects and leaves the list unchanged (AC-26)', async () => {
    const fakes = makeProjectsFakes();
    const before = fakes.snapshot();

    const error = left(
      await run(fakes, viewer, createProject({ name: projectName('Atlas'), type: 'client' })),
    );

    expect(error).toEqual(new PermissionDenied({ permission: MANAGE_PROJECTS }));
    expect(fakes.snapshot()).toEqual(before);
  });

  it('refuses an anonymous actor', async () => {
    const fakes = makeProjectsFakes();
    const error = left(
      await run(
        fakes,
        Actor.Anonymous(),
        createProject({ name: projectName('Atlas'), type: 'client' }),
      ),
    );
    expect(error).toBeInstanceOf(Unauthenticated);
  });
});

describe('closeProject (AC-25, AC-26)', () => {
  const trims = [
    allocation(1, '2026-11-02', '2026-12-31'),
    allocation(2, '2026-11-09', '2027-01-15'),
    allocation(3, '2026-10-05', '2026-12-18'),
  ];
  const later = [allocation(4, '2026-12-07', '2026-12-31')];

  it('answers an unconfirmed close with the hook preview and saves nothing', async () => {
    const fakes = makeProjectsFakes();
    const project = fakes.seedProject('Atlas');
    fakes.hook.impact = { endingAtCloseDate: trims, removed: later };

    const error = left(
      await run(fakes, manager, closeProject(project.id, { closeDate: '2026-11-30' })),
    );

    expect(error).toEqual(
      new ClosingConfirmationRequired({
        closeDate: '2026-11-30',
        endingAtCloseDate: trims,
        removed: later,
      }),
    );
    expect(fakes.hook.previews).toEqual([{ projectId: project.id, closeDate: '2026-11-30' }]);
    expect(fakes.hook.applied).toEqual([]);
    expect(fakes.project(project.id)?.closeDate).toBeNull();
  });

  it('on confirm records the close date and applies the trims in the same transaction', async () => {
    const fakes = makeProjectsFakes();
    const project = fakes.seedProject('Atlas');
    fakes.hook.impact = { endingAtCloseDate: trims, removed: later };

    const closed = right(
      await run(
        fakes,
        manager,
        closeProject(project.id, { closeDate: '2026-11-30', confirm: true }),
      ),
    );

    expect(closed).toMatchObject({ id: project.id, closeDate: '2026-11-30' });
    expect(fakes.project(project.id)?.closeDate).toBe('2026-11-30');
    expect(fakes.hook.applied).toEqual([
      {
        projectId: project.id,
        closeDate: '2026-11-30',
        closedBy: closer,
        inTransaction: true,
        storedCloseDate: '2026-11-30',
      },
    ]);
  });

  it('rolls the close date back when apply fails', async () => {
    const fakes = makeProjectsFakes();
    const project = fakes.seedProject('Atlas');
    fakes.hook.failApply = true;

    const exit = await Effect.runPromiseExit(
      closeProject(project.id, { closeDate: '2026-11-30', confirm: true }).pipe(
        Effect.provideService(CurrentActor, manager),
        Effect.provide(fakes.layer),
      ),
    );

    expect(exit._tag).toBe('Failure');
    expect(fakes.project(project.id)?.closeDate).toBeNull();
  });

  it('closes without asking when nothing would be trimmed or removed', async () => {
    const fakes = makeProjectsFakes();
    const project = fakes.seedProject('Atlas');

    const closed = right(await run(fakes, manager, closeProject(project.id, { closeDate: TODAY })));

    expect(closed.closeDate).toBe(TODAY);
    expect(fakes.hook.applied).toHaveLength(1);
  });

  it('refuses a close date before today, so past plans are never rewritten', async () => {
    const fakes = makeProjectsFakes();
    const project = fakes.seedProject('Atlas');

    const error = left(
      await run(
        fakes,
        manager,
        closeProject(project.id, { closeDate: '2026-11-15', confirm: true }),
      ),
    );

    expect(error).toEqual(new CloseDateInPast({ closeDate: '2026-11-15', today: TODAY }));
    expect(fakes.hook.previews).toEqual([]);
    expect(fakes.hook.applied).toEqual([]);
    expect(fakes.project(project.id)?.closeDate).toBeNull();
  });

  it('refuses closing an already closed project (no reopening)', async () => {
    const fakes = makeProjectsFakes();
    const project = fakes.seedProject('Atlas', 'client', '2026-11-01');

    const error = left(
      await run(
        fakes,
        manager,
        closeProject(project.id, { closeDate: '2026-12-31', confirm: true }),
      ),
    );

    expect(error).toEqual(new ProjectClosed({ id: project.id, closeDate: '2026-11-01' }));
    expect(fakes.project(project.id)?.closeDate).toBe('2026-11-01');
    expect(fakes.hook.applied).toEqual([]);
  });

  it('answers ProjectNotFound for an unknown project', async () => {
    const fakes = makeProjectsFakes();
    const id = ProjectId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd');

    const error = left(await run(fakes, manager, closeProject(id, { closeDate: TODAY })));
    expect(error).toEqual(new ProjectNotFound({ id }));
  });

  it('refuses a user without manage-projects and calls no hook (AC-26)', async () => {
    const fakes = makeProjectsFakes();
    const project = fakes.seedProject('Atlas');

    const error = left(
      await run(
        fakes,
        viewer,
        closeProject(project.id, { closeDate: '2026-11-30', confirm: true }),
      ),
    );

    expect(error).toEqual(new PermissionDenied({ permission: MANAGE_PROJECTS }));
    expect(fakes.hook.previews).toEqual([]);
    expect(fakes.hook.applied).toEqual([]);
    expect(fakes.project(project.id)?.closeDate).toBeNull();
  });
});
