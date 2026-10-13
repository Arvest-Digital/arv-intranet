import type { Db } from '../database';
import { users } from '../schema';

let counter = 0;

export function makeUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  counter += 1;
  return {
    email: `user${counter}@arvest.digital`,
    name: `User ${counter}`,
    ...overrides,
  } satisfies typeof users.$inferInsert;
}

export async function seedUsers(db: Db, rows: Array<typeof users.$inferInsert>) {
  return db.insert(users).values(rows).returning();
}
