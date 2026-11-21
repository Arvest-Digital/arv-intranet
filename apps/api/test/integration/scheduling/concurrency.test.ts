import { env } from 'cloudflare:test';
import {
  Allocation,
  AllocationConflictDetails,
  AllocationHistoryPage,
} from '@arv/contracts/scheduling';
import { ApiErrorBody } from '@arv/contracts/shared';
import {
  makeAccessRole,
  makeAllocation,
  makeEmployeeRecord,
  makeProject,
  makeSession,
  makeUser,
  seedAccessRoles,
  seedAllocations,
  seedEmployeeRecords,
  seedProjects,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { calendarDateIn } from '@arv/kernel';
import { Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T32 — QS-4 «0 lost updates» (sad §10; AC-07b, ADR-0008): two planners save different changes to
 * the same allocation at the same time, both from the version they opened. Exactly one save wins;
 * the other is refused with `409 scheduling.version_conflict` and the winner's values, and the
 * stored allocation and its history hold the winner's change only.
 */

beforeEach(resetDb);

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (offset: number) => calendarDateIn(env.COMPANY_TIME_ZONE)(Date.now() + offset * DAY_MS);

const ROUNDS = 5;

const patch = (path: string, token: string, json: unknown) =>
  api(path, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(json),
  });

const read = (path: string, token: string) =>
  api(path, { headers: { authorization: `Bearer ${token}` } });

const decode = async <S extends Schema.Schema.AnyNoContext>(schema: S, res: Response) =>
  Schema.decodeUnknownSync(schema)(await res.json()) as Schema.Schema.Type<S>;

/** Two planners and one allocation per round: Ann on Atlas, 20 h a week, all in the future. */
const setup = () =>
  withDb(async (db) => {
    const users = await seedUsers(db, [
      makeUser({ name: 'Test Planner A' }),
      makeUser({ name: 'Test Planner B' }),
    ]);
    const [role] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Planners', permissionKeys: ['scheduling:edit-allocations'] }),
    ]);
    await seedUserAccessRoles(
      db,
      users.map((u) => ({ userId: u!.id, accessRoleId: role!.id })),
    );
    const sessions = await seedSessions(
      db,
      users.map((u) => makeSession({ userId: u!.id })),
    );
    const [ann] = await seedEmployeeRecords(db, [
      makeEmployeeRecord({
        fullName: 'Ann Resource',
        employmentStart: day(-400),
        lastChangedBy: users[0]!.id,
      }),
    ]);
    const [atlas] = await seedProjects(db, [makeProject({ name: 'Atlas' })]);
    const allocations = await seedAllocations(
      db,
      Array.from({ length: ROUNDS }, () =>
        makeAllocation({
          employeeId: ann!.id,
          projectId: atlas!.id,
          segments: [{ startsOn: day(14), endsOn: day(41), rateMinutes: 1200, ratePeriod: 'week' }],
          lastChangedBy: users[0]!.id,
        }),
      ),
    );
    const planners = users.map((u, i) => ({ ...u!, token: sessions[i]!.token }));
    return { planners, allocations: allocations.map((a) => a!.id) };
  });

describe('concurrent saves of one allocation (AC-07b, QS-4)', () => {
  it('keeps exactly one of two simultaneous PATCHes and refuses the other with the current values', async () => {
    const { planners, allocations } = await setup();
    const [a, b] = planners as [(typeof planners)[0], (typeof planners)[0]];
    const rate = { [a.id]: 960, [b.id]: 600 };

    for (const id of allocations) {
      const path = `/scheduling/allocations/${id}`;
      // Both opened the allocation at version 1 and save at the same time.
      const [resA, resB] = await Promise.all([
        patch(path, a.token, { version: 1, rateMinutes: rate[a.id] }),
        patch(path, b.token, { version: 1, rateMinutes: rate[b.id] }),
      ]);
      expect([resA.status, resB.status].sort()).toEqual([200, 409]);
      const [winner, saved, refused] =
        resA.status === 200 ? [a, resA, resB] : ([b, resB, resA] as const);

      const kept = await decode(Allocation, saved);
      expect(kept).toMatchObject({ id, version: 2, lastChangedBy: { id: winner.id } });
      expect(kept.segments.at(-1)?.rateMinutes).toBe(rate[winner.id]);

      const { error } = await decode(ApiErrorBody, refused);
      expect(error).toMatchObject({
        _tag: 'Conflict',
        code: 'scheduling.version_conflict',
        message: `${winner.name} changed this allocation meanwhile`,
      });
      const { current } = Schema.decodeUnknownSync(AllocationConflictDetails)(error.details);
      expect(current).toMatchObject({
        id,
        version: 2,
        lastChangedBy: { id: winner.id, name: winner.name },
      });
      expect(current.segments.at(-1)?.rateMinutes).toBe(rate[winner.id]);

      // Nothing of the refused save was stored: the winner's values, one change in history.
      const stored = await decode(Allocation, await read(path, a.token));
      expect(stored).toMatchObject({ version: 2, lastChangedBy: { id: winner.id } });
      expect(stored.segments.map((s) => s.rateMinutes)).toEqual([rate[winner.id]]);
      const history = await decode(AllocationHistoryPage, await read(`${path}/history`, a.token));
      const changes = history.items.filter((item) => item.changeKind === 'changed');
      expect(changes).toHaveLength(1);
      expect(changes[0]!.changedBy.id).toBe(winner.id);
    }
  });

  it('lets the refused planner save on top of the current version', async () => {
    const { planners, allocations } = await setup();
    const [a, b] = planners as [(typeof planners)[0], (typeof planners)[0]];
    const path = `/scheduling/allocations/${allocations[0]}`;
    const [resA, resB] = await Promise.all([
      patch(path, a.token, { version: 1, rateMinutes: 960 }),
      patch(path, b.token, { version: 1, rateMinutes: 600 }),
    ]);
    const loser = resA.status === 409 ? a : b;
    expect([resA.status, resB.status].sort()).toEqual([200, 409]);

    const retried = await patch(path, loser.token, { version: 2, rateMinutes: 480 });
    expect(retried.status).toBe(200);
    expect(await decode(Allocation, retried)).toMatchObject({
      version: 3,
      lastChangedBy: { id: loser.id },
    });
  });
});
