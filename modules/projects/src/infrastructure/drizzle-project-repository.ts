import { Database, type DbError, query } from '@arv/db';
import { ProjectId } from '@arv/kernel';
import { and, asc, eq, gte, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { ProjectRepository } from '../application/ports';
import { Project } from '../domain/project';
import { projects } from './schema';

type Row = typeof projects.$inferSelect;

/** Decodes the row through the domain class: an unknown `type` or bad date is a defect. */
const toProject = (row: Row) =>
  new Project({ ...row, id: ProjectId.make(row.id), type: row.type as Project['type'] });

/** The expression `idx_projects_name_key` is built on (AC-24), so lookups can use the index. */
const nameKey = sql`lower(btrim(${projects.name}))`;

const byName = [asc(nameKey), asc(projects.id)];

export const DrizzleProjectRepositoryLive = Layer.effect(
  ProjectRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    const select = (where?: SQL) =>
      run(
        query((db) =>
          db
            .select()
            .from(projects)
            .where(where)
            .orderBy(...byName),
        ),
      ).pipe(Effect.map((rows) => rows.map(toProject)));

    const first = (where: SQL) =>
      run(query((db) => db.select().from(projects).where(where).limit(1))).pipe(
        Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toProject))),
      );

    return {
      create: (input) =>
        run(
          query((db) =>
            db.insert(projects).values({ name: input.name, type: input.type }).returning(),
          ),
        ).pipe(
          Effect.map(([row]) => {
            if (row === undefined) throw new Error('project INSERT returned no row');
            return toProject(row);
          }),
        ),
      findById: (id) => first(eq(projects.id, id)),
      list: (filter = {}) =>
        select(filter.type === undefined ? undefined : eq(projects.type, filter.type)),
      listByIds: (ids) =>
        ids.length === 0 ? Effect.succeed([]) : select(inArray(projects.id, [...new Set(ids)])),
      // Open on `date`: no close date, or closed only after it (`isOpenOn` in the domain).
      findOpenByNameKey: (key, date) =>
        first(
          and(
            sql`${nameKey} = ${key}`,
            or(isNull(projects.closeDate), gte(projects.closeDate, date)),
          ) as SQL,
        ),
      setCloseDate: (id, closeDate) =>
        run(
          query((db) =>
            db.update(projects).set({ closeDate }).where(eq(projects.id, id)).returning(),
          ),
        ).pipe(Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toProject)))),
    };
  }),
);
