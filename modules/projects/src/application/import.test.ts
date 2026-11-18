import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ProjectName } from '../domain/project';
import { ProjectsApi, ProjectsApiLive } from './projects-api';
import { makeProjectsFakes, TODAY } from './testing';

const name = Schema.decodeSync(ProjectName);

const setup = () => {
  const fakes = makeProjectsFakes();
  const run = <A>(use: (api: ProjectsApi['Type']) => Effect.Effect<A>) =>
    Effect.runPromise(
      Effect.flatMap(ProjectsApi, use).pipe(
        Effect.provide(ProjectsApiLive.pipe(Layer.provide(fakes.layer))),
      ),
    );
  return { fakes, run };
};

describe('ProjectsApi.importProjects (flow 13, AC-30)', () => {
  it('creates new projects as open and reuses one open today with the same name (AC-24)', async () => {
    const { fakes, run } = setup();
    const atlas = fakes.seedProject('Atlas', 'client');
    // Closed before today: its name is free again, so the import makes a new Hermes.
    const oldHermes = fakes.seedProject('Hermes', 'internal', '2026-11-15');
    // Closes today: still open, so it is reused.
    const zeus = fakes.seedProject('Zeus', 'client', TODAY);

    const imported = await run((api) =>
      api.importProjects([
        { name: name('Sick leave'), type: 'leave' },
        { name: name(' atlas '), type: 'internal' },
        { name: name('hermes'), type: 'internal' },
        { name: name('SICK LEAVE'), type: 'client' },
        { name: name('zeus'), type: 'bench' },
      ]),
    );

    expect(imported.map(({ name, type, created }) => [name, type, created])).toEqual([
      ['Sick leave', 'leave', true],
      ['Atlas', 'client', false],
      ['hermes', 'internal', true],
      ['Zeus', 'client', false],
    ]);
    expect(imported[1]?.id).toBe(atlas.id);
    expect(imported[2]?.id).not.toBe(oldHermes.id);
    expect(imported[3]?.id).toBe(zeus.id);
    expect(fakes.snapshot()).toHaveLength(5);
  });

  it('creates nothing for an empty list', async () => {
    const { fakes, run } = setup();
    expect(await run((api) => api.importProjects([]))).toEqual([]);
    expect(fakes.snapshot()).toEqual([]);
  });
});
