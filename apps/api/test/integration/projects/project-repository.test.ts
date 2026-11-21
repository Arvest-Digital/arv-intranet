import { env } from 'cloudflare:test';
import { DatabaseLive } from '@arv/db';
import { makeProject, seedProjects } from '@arv/db/testing';
import { ProjectId } from '@arv/kernel';
import { Effect, Layer, Option, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
// The adapter is not exported by @arv/projects (only `.`, `./http`, `./layer`), so it is
// reached by path, like a module-internal test would.
import { ProjectRepository } from '../../../../../modules/projects/src/application/ports';
import {
  Project,
  ProjectName,
  projectNameKey,
} from '../../../../../modules/projects/src/domain/project';
import { DrizzleProjectRepositoryLive } from '../../../../../modules/projects/src/infrastructure/drizzle-project-repository';
import { resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

const TestLayer = DrizzleProjectRepositoryLive.pipe(
  Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
);

type Repo = ProjectRepository['Type'];

const run = <A, E>(use: (repo: Repo) => Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flatMap(ProjectRepository, use).pipe(Effect.provide(TestLayer)));

const name = Schema.decodeSync(ProjectName);
const UNKNOWN = ProjectId.make('0190a0b0-0000-7000-8000-00000000ffff');
const TODAY = '2026-11-15';

/** Seeds `rows` and returns them in input order, failing the test when one is missing. */
const seed = async (...rows: Parameters<typeof makeProject>[0][]) => {
  const seeded = await withDb((db) => seedProjects(db, rows.map(makeProject)));
  expect(seeded).toHaveLength(rows.length);
  return seeded.map((row) => ({ ...row, id: ProjectId.make(row.id) }));
};

describe('DrizzleProjectRepository: create and read (AC-23)', () => {
  it('creates an open project and reads it back by id', async () => {
    const created = await run((repo) => repo.create({ name: name(' Atlas '), type: 'client' }));

    expect(created).toBeInstanceOf(Project);
    expect(created).toMatchObject({ name: 'Atlas', type: 'client', closeDate: null });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(await run((repo) => repo.findById(created.id))).toEqual(Option.some(created));
  });

  it('finds nothing for an unknown id', async () => {
    expect(await run((repo) => repo.findById(UNKNOWN))).toEqual(Option.none());
  });

  it('reads a seeded close date back as YYYY-MM-DD', async () => {
    const [seeded] = await seed({ closeDate: '2026-11-20' });
    expect(seeded?.closeDate).toBe('2026-11-20');

    const found = await run((repo) => repo.findById(seeded!.id));

    expect(Option.map(found, (p) => p.closeDate)).toEqual(Option.some('2026-11-20'));
  });
});

describe('DrizzleProjectRepository: list', () => {
  it('lists by ids with names and types, skipping unknown and repeated ids', async () => {
    const [atlas, leave, bench] = await seed(
      { name: 'Atlas' },
      { name: 'Annual leave', type: 'leave' },
      { name: 'Bench', type: 'bench' },
    );

    const listed = await run((repo) => repo.listByIds([atlas!.id, leave!.id, atlas!.id, UNKNOWN]));

    expect(listed.map(({ id, name, type }) => ({ id, name, type }))).toEqual([
      { id: leave!.id, name: 'Annual leave', type: 'leave' },
      { id: atlas!.id, name: 'Atlas', type: 'client' },
    ]);
    expect(listed.map((p) => p.id)).not.toContain(bench!.id);
    expect(await run((repo) => repo.listByIds([]))).toEqual([]);
  });

  it('lists every project, or only those of one type, ordered by name ignoring case', async () => {
    await seed(
      { name: 'Zeta' },
      { name: 'Sick leave', type: 'leave' },
      { name: 'alpha' },
      { name: 'Annual leave', type: 'leave' },
    );

    expect((await run((repo) => repo.list())).map((p) => p.name)).toEqual([
      'alpha',
      'Annual leave',
      'Sick leave',
      'Zeta',
    ]);
    expect((await run((repo) => repo.list({ type: 'leave' }))).map((p) => p.name)).toEqual([
      'Annual leave',
      'Sick leave',
    ]);
    expect(await run((repo) => repo.list({ type: 'training' }))).toEqual([]);
  });
});

describe('DrizzleProjectRepository: findOpenByNameKey (AC-24)', () => {
  const findOpen = (raw: string) =>
    run((repo) => repo.findOpenByNameKey(projectNameKey(raw), TODAY)).then((found) =>
      Option.map(found, (p) => p.id),
    );

  it('finds an open project ignoring case and surrounding spaces', async () => {
    const [atlas] = await seed({ name: 'Atlas' });
    expect(await findOpen('atlas ')).toEqual(Option.some(atlas!.id));
  });

  it('ignores a closed project with the same key', async () => {
    await seed({ name: 'Atlas', closeDate: '2026-11-14' });
    expect(await findOpen(' ATLAS')).toEqual(Option.none());
  });

  it('finds the open one when a closed project shares its key', async () => {
    const [, open] = await seed({ name: 'Atlas', closeDate: '2026-01-31' }, { name: 'atlas' });
    expect(await findOpen('Atlas')).toEqual(Option.some(open!.id));
  });

  it('counts a project whose close date is today as still open', async () => {
    const [atlas] = await seed({ name: 'Atlas', closeDate: TODAY });
    expect(await findOpen('atlas')).toEqual(Option.some(atlas!.id));
  });

  it('finds nothing for a different name', async () => {
    await seed({ name: 'Atlas' });
    expect(await findOpen('Atlas 2')).toEqual(Option.none());
  });
});

describe('DrizzleProjectRepository: setCloseDate (AC-25)', () => {
  it('stores the close date', async () => {
    const created = await run((repo) => repo.create({ name: name('Atlas'), type: 'internal' }));

    const closed = await run((repo) => repo.setCloseDate(created.id, '2026-12-01'));

    expect(Option.map(closed, (p) => p.closeDate)).toEqual(Option.some('2026-12-01'));
    const reread = await run((repo) => repo.findById(created.id));
    expect(Option.map(reread, (p) => p.closeDate)).toEqual(Option.some('2026-12-01'));
  });

  it('returns None for an unknown project', async () => {
    expect(await run((repo) => repo.setCloseDate(UNKNOWN, '2026-12-01'))).toEqual(Option.none());
  });
});

describe('projects fixtures', () => {
  it('defaults to an open client project named «Project <n>»', async () => {
    const [project] = await seed({});
    expect(project).toMatchObject({ type: 'client', closeDate: null });
    expect(project?.name).toMatch(/^Project \d+$/);
    expect(project?.createdAt).toBeInstanceOf(Date);
  });
});
