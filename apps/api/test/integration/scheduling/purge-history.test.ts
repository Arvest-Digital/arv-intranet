import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { createDb, databaseLayer } from '@arv/db';
import { makeHistoryEntry, seedAllocationHistory } from '@arv/db/testing';
import { SchedulingApi } from '@arv/scheduling';
import { Clock, Effect, HashMap, List, Logger } from 'effect';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeScheduledLayer } from '../../../src/composition';
import { resetDb, withDb } from '../../helpers';

/**
 * T31 — the monthly allocation-history purge (AC-16, QS-5; sad §6 Cross-cutting: Monthly history
 * purge, §7 Cron `0 3 1 * *`). Runs through the host's scheduled composition against the real
 * database; the clock is fixed.
 */

beforeEach(resetDb);

const base = {
  allocationId: '0190a0b0-0000-7000-8000-000000000301',
  employeeId: '0190a0b0-0000-7000-8000-000000000101',
  projectId: '0190a0b0-0000-7000-8000-000000000201',
  changedBy: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
};

const seedAt = (...createdAt: ReadonlyArray<string>) =>
  withDb((db) =>
    seedAllocationHistory(
      db,
      createdAt.map((at) => makeHistoryEntry({ ...base, createdAt: new Date(at) })),
    ),
  );

const remaining = () =>
  withDb(async (db) =>
    (
      await db.execute<{ created_at: string }>(
        'SELECT created_at FROM scheduling.allocation_history ORDER BY created_at',
      )
    ).rows.map((row) => new Date(row.created_at).toISOString()),
  );

/**
 * A clock stopped at `ms`. Not `TestContext`: under it the pg sockets this file opens error later,
 * in another test file.
 */
const stoppedAt = (ms: number): Clock.Clock => {
  const live = Clock.make();
  const nanos = BigInt(ms) * BigInt(1_000_000);
  return {
    [Clock.ClockTypeId]: Clock.ClockTypeId,
    unsafeCurrentTimeMillis: () => ms,
    currentTimeMillis: Effect.succeed(ms),
    unsafeCurrentTimeNanos: () => nanos,
    currentTimeNanos: Effect.succeed(nanos),
    sleep: (duration) => live.sleep(duration),
  };
};

type LogLine = { level: string; message: unknown; annotations: Record<string, unknown> };

/** Runs the purge as the Cron Trigger would at `at`, capturing its log lines. */
const purgeAt = async (at: string) => {
  const logs: Array<LogLine> = [];
  const capture = Logger.make(({ logLevel, message, annotations }) => {
    logs.push({
      level: logLevel.label,
      message: List.isList(message) ? List.toArray(message) : message,
      annotations: Object.fromEntries(HashMap.toEntries(annotations)),
    });
  });
  // One client, like `withDb`: a pool's idle sockets outlive the test and error in a later file.
  const client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  const database = databaseLayer(createDb(client));
  const report = await Effect.flatMap(SchedulingApi, (scheduling) =>
    scheduling.purgeExpiredHistory(),
  ).pipe(
    Effect.provide(makeScheduledLayer(env, database)),
    Effect.provide(Logger.replace(Logger.defaultLogger, capture)),
    Effect.withClock(stoppedAt(Date.parse(at))),
    Effect.runPromise,
  );
  return { report, logs };
};

describe('monthly allocation-history purge (QS-5)', () => {
  // The Cron Trigger fires at 03:00 UTC on 1 March 2026; in Kyiv that is 1 March as well, so the
  // cut-off is 1 March 2025, 00:00 UTC.
  const RUN = '2026-03-01T03:00:00.000Z';

  it('deletes entries older than 12 months, keeps newer ones, and a rerun deletes nothing', async () => {
    await seedAt(
      '2024-06-01T12:00:00.000Z',
      '2025-02-28T23:59:59.000Z',
      '2025-03-01T00:00:00.000Z',
      '2026-02-15T08:30:00.000Z',
    );

    const first = await purgeAt(RUN);
    expect(first.report).toEqual({
      cutOff: new Date('2025-03-01T00:00:00.000Z'),
      entriesDeleted: 2,
      oldestRemainingAgeDays: 365,
    });
    expect(await remaining()).toEqual(['2025-03-01T00:00:00.000Z', '2026-02-15T08:30:00.000Z']);

    const rerun = await purgeAt(RUN);
    expect(rerun.report.entriesDeleted).toBe(0);
    expect(rerun.report.oldestRemainingAgeDays).toBe(365);
    expect(await remaining()).toHaveLength(2);
  });

  it('logs the retention report line with counts only, no personal data', async () => {
    await seedAt('2025-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z');

    const { logs } = await purgeAt(RUN);
    expect(logs).toEqual([
      {
        level: 'INFO',
        message: ['scheduling.history_purge'],
        annotations: {
          cutOff: '2025-03-01T00:00:00.000Z',
          entriesDeleted: 1,
          oldestRemainingAgeDays: 50,
        },
      },
    ]);
    const line = JSON.stringify(logs);
    for (const id of Object.values(base)) expect(line).not.toContain(id);
  });

  it('reports no oldest age when the history is empty', async () => {
    const { report } = await purgeAt(RUN);
    expect(report).toMatchObject({ entriesDeleted: 0, oldestRemainingAgeDays: null });
  });
});

/** `Fetcher.scheduled` exists in workerd but not in the generated `Fetcher` type. */
type ScheduledFetcher = {
  scheduled(options: { scheduledTime?: Date; cron?: string }): Promise<unknown>;
};

describe('scheduled entry point', () => {
  it("runs the purge from the Worker's scheduled event", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await seedAt(
      new Date(now - 800 * day).toISOString(),
      new Date(now - 400 * day).toISOString(),
      new Date(now - 30 * day).toISOString(),
    );

    // Through the Worker's own `scheduled` event, as the Cron Trigger fires it.
    await (exports.default as unknown as ScheduledFetcher).scheduled({
      scheduledTime: new Date(now),
      cron: '0 3 1 * *',
    });

    expect(await remaining()).toEqual([new Date(now - 30 * day).toISOString()]);
  });
});
