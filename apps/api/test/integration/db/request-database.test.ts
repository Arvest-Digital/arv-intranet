import { env } from 'cloudflare:test';
import { Database } from '@arv/db';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../../src/env';
import { requestDatabase } from '../../../src/middleware/request-database';

describe('requestDatabase', () => {
  it('gives every Layer of a request the same Database, and each request its own', async () => {
    const seen: unknown[] = [];
    const app = new Hono<AppEnv>().get('/', async (c) => {
      // As the access check and then the app Layer do, in that order.
      for (let i = 0; i < 2; i++) {
        seen.push(await Effect.runPromise(Effect.provide(Database, requestDatabase(c))));
      }
      return c.text('ok');
    });

    await app.request('/', {}, env);
    await app.request('/', {}, env);

    expect(seen).toHaveLength(4);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[3]).toBe(seen[2]);
    expect(seen[2]).not.toBe(seen[0]);
  });
});
