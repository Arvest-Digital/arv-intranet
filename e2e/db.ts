import { connectDb } from '@arv/db/testing';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://arv:arv@localhost:5432/arv_test';

export type TestDb = Awaited<ReturnType<typeof connectDb>>['db'];

/** Runs `fn` on a fresh connection to the e2e database and closes it afterwards. */
export async function withDb<T>(fn: (db: TestDb) => Promise<T>): Promise<T> {
  const { db, close } = await connectDb(TEST_DATABASE_URL);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}
