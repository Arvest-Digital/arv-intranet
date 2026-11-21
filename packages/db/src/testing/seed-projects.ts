import { sql } from 'drizzle-orm';
import type { Executor } from '../database';

// Seeds projects.projects with raw SQL (data-model.md §Test fixtures): @arv/db sits below the
// modules and can't import their tables. Mirrors `modules/projects/src/domain/project.ts`.

let counter = 0;

export type ProjectSeedType = 'client' | 'internal' | 'bench' | 'training' | 'leave';

export type ProjectSeed = {
  id?: string;
  name: string;
  type: ProjectSeedType;
  /** `YYYY-MM-DD`, or `null` for an open project with no close date. */
  closeDate: string | null;
  createdAt?: Date;
};
export type SeededProject = {
  id: string;
  name: string;
  type: ProjectSeedType;
  closeDate: string | null;
  createdAt: Date;
};

/** An open client project named `Project <n>`. For leave: `{ type: 'leave', name: 'Annual leave' }`. */
export function makeProject(overrides: Partial<ProjectSeed> = {}): ProjectSeed {
  counter += 1;
  return { name: `Project ${counter}`, type: 'client', closeDate: null, ...overrides };
}

/** Inserts the projects; returns them in input order. */
export async function seedProjects(db: Executor, rows: ReadonlyArray<ProjectSeed>) {
  if (rows.length === 0) return [];
  const values = sql.join(
    rows.map(
      (row, ordinal) => sql`(
        ${ordinal}::int,
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.name},
        ${row.type},
        ${row.closeDate}::date,
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )`,
    ),
    sql`, `,
  );
  // INSERT … RETURNING has no guaranteed order, so the input ordinal sorts the result.
  // drizzle's pg driver hands raw `execute` results back as strings, so `createdAt` is parsed here.
  const { rows: seeded } = await db.execute<
    Omit<SeededProject, 'createdAt'> & { createdAt: string }
  >(sql`
    WITH input (ordinal, id, name, type, close_date, created_at) AS (VALUES ${values}),
    inserted AS (
      INSERT INTO projects.projects (id, name, type, close_date, created_at)
      SELECT id, name, type, close_date, created_at FROM input ORDER BY ordinal
      RETURNING id, name, type, close_date::text AS "closeDate", created_at AS "createdAt"
    )
    SELECT inserted.* FROM inserted JOIN input USING (id) ORDER BY input.ordinal
  `);
  return seeded.map((row): SeededProject => ({ ...row, createdAt: new Date(row.createdAt) }));
}
