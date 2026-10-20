import { sql } from 'drizzle-orm';
import type { Db } from '../database';

// Seeds identity.users with raw SQL: @arv/db sits below the modules and can't import their tables.

export type UserSeed = { id?: string; email: string; name: string; createdAt?: Date };
export type SeededUser = { id: string; email: string; name: string; createdAt: Date };

let counter = 0;

export function makeUser(overrides: Partial<UserSeed> = {}): UserSeed {
  counter += 1;
  return {
    email: `user${counter}@arvest.digital`,
    name: `User ${counter}`,
    ...overrides,
  };
}

export async function seedUsers(db: Db, rows: ReadonlyArray<UserSeed>) {
  if (rows.length === 0) return [];
  const values = sql.join(
    rows.map(
      (row) => sql`(
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.email},
        ${row.name},
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )`,
    ),
    sql`, `,
  );
  const { rows: seeded } = await db.execute<SeededUser>(sql`
    INSERT INTO identity.users (id, email, name, created_at) VALUES ${values}
    RETURNING id, email, name, created_at AS "createdAt"
  `);
  return seeded;
}
