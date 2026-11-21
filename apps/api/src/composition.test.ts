import { Database, type Db } from '@arv/db';
import { Actor } from '@arv/kernel';
import { OrgApi } from '@arv/org';
import { ProjectsApi } from '@arv/projects';
import { SchedulingApi } from '@arv/scheduling';
import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeAppLayer } from './composition';
import type { Bindings } from './env';

// Building the Layer never touches the database, so a stand-in is enough here.
const database = Layer.succeed(Database, {} as Db);
const env = { GOOGLE_CLIENT_SECRET: 'test-secret' } as Bindings;

describe('makeAppLayer', () => {
  it('provides the org, projects and scheduling facades', async () => {
    const facades = Effect.all([OrgApi, ProjectsApi, SchedulingApi]).pipe(
      Effect.provide(makeAppLayer(env, Actor.Anonymous(), database)),
    );
    await expect(Effect.runPromise(facades)).resolves.toHaveLength(3);
  });
});
