import { ProjectId } from '@arv/kernel';
import { Effect, Layer, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { isOpenOn } from '../domain/project';
import { ProjectRepository } from './ports';
import { ProjectsApi, ProjectsApiLive } from './projects-api';
import { makeProjectsFakes } from './testing';

const setup = () => {
  const fakes = makeProjectsFakes();
  const layer = ProjectsApiLive.pipe(
    Layer.provide(Layer.succeed(ProjectRepository, fakes.projects)),
  );
  const run = <A>(f: (api: ProjectsApi['Type']) => Effect.Effect<A>) =>
    Effect.runPromise(Effect.flatMap(ProjectsApi, f).pipe(Effect.provide(layer)));
  return { fakes, run };
};

describe('ProjectsApi', () => {
  it('gets a project as other modules see it, and None for an unknown id', async () => {
    const { fakes, run } = setup();
    const atlas = fakes.seedProject('Atlas', 'client', '2026-11-30');

    expect(await run((api) => api.get(atlas.id))).toEqual(
      Option.some({ id: atlas.id, name: 'Atlas', type: 'client', closeDate: '2026-11-30' }),
    );
    expect(
      await run((api) => api.get(ProjectId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd'))),
    ).toEqual(Option.none());
  });

  it('lists the known projects among ids by name, skipping unknown ones', async () => {
    const { fakes, run } = setup();
    const zeus = fakes.seedProject('Zeus');
    const atlas = fakes.seedProject('atlas', 'internal');
    fakes.seedProject('Hermes');

    const listed = await run((api) =>
      api.listByIds([zeus.id, atlas.id, ProjectId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd')]),
    );
    expect(listed.map((p) => p.name)).toEqual(['atlas', 'Zeus']);
  });

  it('a project is open through its close date and closed the day after', async () => {
    const { fakes, run } = setup();
    const atlas = fakes.seedProject('Atlas', 'client', '2026-11-30');
    const info = Option.getOrThrow(await run((api) => api.get(atlas.id)));

    expect(isOpenOn(info, '2026-11-30')).toBe(true);
    expect(isOpenOn(info, '2026-12-01')).toBe(false);
  });
});
