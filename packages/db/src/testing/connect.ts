import pg from 'pg';
import { createDb } from '../database';

/** Node-side DB connection for test setup (e2e, scripts). Call `close` when done. */
export async function connectDb(connectionString: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  return { db: createDb(client), close: () => client.end() };
}
