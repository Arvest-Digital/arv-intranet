import { env } from 'cloudflare:test';
import { DatabaseLive } from '@arv/db';
import { makeTeam, makeUser, seedTeams, seedUsers } from '@arv/db/testing';
import { Actor, UnitOfWork, UserId } from '@arv/kernel';
import { EmployeeName, OrgApi, TeamName } from '@arv/org';
import { ProjectName, ProjectsApi } from '@arv/projects';
import { Data, Effect, Exit, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeAppLayer } from '../../../src/composition';
import { resetDb, withDb } from '../../helpers';

/**
 * T33 — the org and projects import commands join the caller's unit of work (ADR-0006, flow 13):
 * run through the host's real composition and Postgres, they commit together, and a failure after
 * both leaves no row in either schema (AC-30, AC-31 all-or-nothing).
 */

beforeEach(resetDb);

class LaterRowFailed extends Data.TaggedError('LaterRowFailed') {}

const employeeName = Schema.decodeSync(EmployeeName);
const teamName = Schema.decodeSync(TeamName);
const projectName = Schema.decodeSync(ProjectName);

const select = (text: string) => withDb(async (db) => (await db.execute(text)).rows);

const seedImporter = () =>
  withDb(async (db) => {
    const [user] = await seedUsers(db, [makeUser({ name: 'Test Importer' })]);
    return UserId.make(user!.id);
  });

/** Both commands in one `transactional`, then `after` — as the import commit will run them. */
const importBoth = <E>(importer: UserId, after: Effect.Effect<void, E>) =>
  Effect.gen(function* () {
    const unitOfWork = yield* UnitOfWork;
    const org = yield* OrgApi;
    const projects = yield* ProjectsApi;
    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const imported = yield* org.importRecords(
          {
            teams: [teamName('Design')],
            records: [
              {
                fullName: employeeName('Test Ann'),
                teamName: teamName('Platform'),
                contractMinutes: 2400,
                employmentStart: '2026-01-05',
                employmentEnd: null,
              },
              {
                fullName: employeeName('Test Incomplete'),
                teamName: null,
                contractMinutes: null,
                employmentStart: null,
                employmentEnd: null,
              },
            ],
          },
          importer,
        );
        const created = yield* projects.importProjects([
          { name: projectName('Atlas'), type: 'client' },
          { name: projectName('Sick leave'), type: 'leave' },
        ]);
        yield* after;
        return { ...imported, projects: created };
      }),
    );
  }).pipe(
    Effect.provide(
      makeAppLayer(env, Actor.Anonymous(), DatabaseLive(env.HYPERDRIVE.connectionString)),
    ),
  );

const counts = async () => ({
  records: await select(
    'SELECT full_name, last_changed_by FROM org.employee_records ORDER BY full_name',
  ),
  teams: await select('SELECT name, team_lead_id FROM org.teams ORDER BY name'),
  projects: await select('SELECT name, type, close_date FROM projects.projects ORDER BY name'),
});

describe('org and projects import commands in one unit of work (T33, ADR-0006)', () => {
  it('commit together: records (incomplete included), teams without a lead, open projects', async () => {
    const importer = await seedImporter();
    const [existing] = await withDb((db) => seedTeams(db, [makeTeam({ name: 'platform' })]));

    const exit = await Effect.runPromiseExit(importBoth(importer, Effect.void));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.teams.map((t) => [t.name, t.created])).toEqual([
        ['Design', true],
        ['platform', false],
      ]);
      expect(exit.value.records[0]?.teamId).toBe(existing!.id);
      expect(exit.value.projects.every((p) => p.created)).toBe(true);
    }
    expect(await counts()).toEqual({
      records: [
        { full_name: 'Test Ann', last_changed_by: importer },
        { full_name: 'Test Incomplete', last_changed_by: importer },
      ],
      teams: [
        { name: 'Design', team_lead_id: null },
        { name: 'platform', team_lead_id: existing!.teamLeadId },
      ],
      projects: [
        { name: 'Atlas', type: 'client', close_date: null },
        { name: 'Sick leave', type: 'leave', close_date: null },
      ],
    });
  });

  it('a failure after both commands leaves no row in either schema', async () => {
    const importer = await seedImporter();

    const exit = await Effect.runPromiseExit(importBoth(importer, new LaterRowFailed()));

    expect(exit).toEqual(Exit.fail(new LaterRowFailed()));
    expect(await counts()).toEqual({ records: [], teams: [], projects: [] });
  });
});
