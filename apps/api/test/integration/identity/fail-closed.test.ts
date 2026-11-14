import { env } from 'cloudflare:test';
import { makeSession, seedAdmin, seedSessions } from '@arv/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import host from '../../../src/index';
import { isPublicRoute } from '../../../src/middleware/authenticate';
import { api, resetDb, withDb } from '../../helpers';
import { FailingDatabase, makeTestApp, request } from './qg1-pipeline';

/**
 * T21 — QG-1 scenario 1c, Fail closed (sad §10; PRD §6 Fail closed). When access can't be
 * determined, nothing is served: every authenticated route answers no 2xx, even to an admin whose
 * session is valid and was just served (so a remembered actor would let the request through).
 */

beforeEach(resetDb);

const PLACEHOLDER_ID = '00000000-0000-7000-8000-000000000000';
/** Nothing listens on port 1: the connection is refused. */
const UNREACHABLE_DATABASE_URL = 'postgres://arv:arv@127.0.0.1:1/arv_test';

/** Every non-public route the host mounts, plus the suite's stand-in feature routes. */
const authenticatedRoutes = [...host.routes, ...makeTestApp().routes]
  .filter((route) => route.method !== 'ALL')
  .map((route) => ({
    method: route.method,
    path: route.path.replace(/:[^/]+/g, PLACEHOLDER_ID),
  }))
  .filter((route) => !isPublicRoute(route.method, route.path))
  .filter(
    (route, index, all) =>
      all.findIndex((other) => other.method === route.method && other.path === route.path) ===
      index,
  );

const bodyFor = (method: string) => (method === 'GET' || method === 'DELETE' ? undefined : {});

/** An admin with a live session, served once through the real host. */
const signedInAdmin = async () => {
  const token = await withDb(async (db) => {
    const { user } = await seedAdmin(db);
    const [session] = await seedSessions(db, [makeSession({ userId: user.id })]);
    return session!.token;
  });
  expect(
    (await api('/identity/me', { headers: { authorization: `Bearer ${token}` } })).status,
  ).toBe(200);
  return token;
};

const cases = authenticatedRoutes.map((route) => [`${route.method} ${route.path}`, route] as const);

describe('fail closed (QG-1 1c)', () => {
  it('finds the routes to check', () => {
    expect(authenticatedRoutes).toContainEqual({ method: 'GET', path: '/identity/me' });
    expect(authenticatedRoutes).toContainEqual({ method: 'GET', path: '/users' });
    expect(authenticatedRoutes).toContainEqual({
      method: 'POST',
      path: '/test-scheduling/allocations',
    });
  });

  describe('with a database Layer whose every query fails', () => {
    const failing = makeTestApp(FailingDatabase);

    it.each(cases)('answers 500 to %s', async (_, route) => {
      const token = await signedInAdmin();
      const res = await failing.fetch(
        request(route.path, { method: route.method, token, body: bodyFor(route.method) }),
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({
        error: { _tag: 'InternalError', code: 'platform.internal_error' },
      });
    });
  });

  describe('with an unreachable connection string, through the real host', () => {
    const unreachableEnv = {
      ...env,
      HYPERDRIVE: { connectionString: UNREACHABLE_DATABASE_URL } as Hyperdrive,
    };

    it.each(cases)('answers no 2xx to %s', async (_, route) => {
      const token = await signedInAdmin();
      const req = request(route.path, { method: route.method, token, body: bodyFor(route.method) });
      const res = await host.fetch(req, unreachableEnv);
      expect(res.status).toBeGreaterThanOrEqual(500);
    });
  });
});
