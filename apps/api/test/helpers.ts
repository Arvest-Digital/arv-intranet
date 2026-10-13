import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { createDb } from '@arv/db';
import { resetDatabase } from '@arv/db/testing';
import pg from 'pg';

/**
 * Runs `fn` with a DB client on the test Hyperdrive binding (for setup/assertions).
 * Not closed explicitly, same as in the Worker (see `DatabaseLive`).
 */
export async function withDb<A>(fn: (db: ReturnType<typeof createDb>) => Promise<A>) {
  const client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  return fn(createDb(client));
}

export const resetDb = () => withDb(resetDatabase);

/** Sends a request to the Worker under test. */
export const api = (path: string, init?: RequestInit) =>
  exports.default.fetch(new Request(`http://api.test${path}`, init));

export const postJson = (path: string, body: unknown) =>
  api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
