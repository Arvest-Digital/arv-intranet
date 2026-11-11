import { makeSession, makeUser, seedSessions, seedUsers } from '@arv/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../../src/index';
import { isPublicRoute } from '../../../src/middleware/authenticate';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T20 — the host's `authenticate` and composition (sad §8 Authentication, §7 Configuration;
 * AC-03, AC-07, AC-18, AC-20). Everything goes through the real Worker.
 */

beforeEach(resetDb);

const PLACEHOLDER_ID = '00000000-0000-7000-8000-000000000000';

/** Every mounted route that is not public, read from the app itself. */
const protectedRoutes = app.routes
  .filter((route) => route.method !== 'ALL')
  .map((route) => ({
    method: route.method,
    path: route.path.replace(/:[^/]+/g, PLACEHOLDER_ID),
  }))
  .filter((route) => !isPublicRoute(route.method, route.path));

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const errorOf = async (res: Response) => ((await res.json()) as { error: unknown }).error;

describe('authenticate', () => {
  it('finds the routes to check in the app', () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
    expect(protectedRoutes).toContainEqual({ method: 'GET', path: '/identity/me' });
  });

  it.each(protectedRoutes.map((route) => [`${route.method} ${route.path}`, route] as const))(
    'answers 401 to an anonymous %s',
    async (_, route) => {
      const res = await api(route.path, {
        method: route.method,
        headers: { 'content-type': 'application/json' },
        body: route.method === 'GET' || route.method === 'DELETE' ? undefined : '{}',
      });
      expect(res.status).toBe(401);
      expect(await errorOf(res)).toMatchObject({
        _tag: 'Unauthenticated',
        code: 'platform.unauthenticated',
      });
    },
  );

  it('answers 401 to an unknown route rather than revealing it', async () => {
    expect((await api('/no-such-route')).status).toBe(401);
  });

  it('answers 401 for a token that matches no session', async () => {
    const res = await api('/identity/me', { headers: bearer('x'.repeat(43)) });
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toMatchObject({ code: 'platform.unauthenticated' });
  });

  it('answers 401 access-removed for a revoked session, with Server-Timing (AC-07)', async () => {
    const [session] = await withDb((db) =>
      seedSessions(db, [makeSession({ userId: null, revokedReason: 'access-removed' })]),
    );

    const res = await api('/identity/me', { headers: bearer(session!.token) });

    expect(res.status).toBe(401);
    expect(await errorOf(res)).toMatchObject({
      _tag: 'Unauthenticated',
      code: 'identity.access_removed',
    });
    expect(res.headers.get('server-timing')).toMatch(/^accessCheck;dur=\d+(\.\d+)?$/);
  });

  it('lets an active session through and reports the access check in Server-Timing', async () => {
    const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
    const [session] = await withDb((db) => seedSessions(db, [makeSession({ userId: user!.id })]));

    const res = await api('/identity/me', { headers: bearer(session!.token) });

    expect(res.status).toBe(200);
    expect(res.headers.get('server-timing')).toMatch(/accessCheck;dur=\d+(\.\d+)?/);
  });

  it('keeps sign-in public even with a revoked token attached', async () => {
    const [session] = await withDb((db) =>
      seedSessions(db, [makeSession({ userId: null, revokedReason: 'access-removed' })]),
    );
    const res = await api('/identity/sign-in/begin', {
      method: 'POST',
      headers: bearer(session!.token),
    });
    expect(res.status).toBe(200);
  });

  it('keeps /health public', async () => {
    expect((await api('/health')).status).toBe(200);
  });
});

describe('composition', () => {
  it('builds the Google address from the env (GOOGLE_CLIENT_ID, SIGN_IN_RETURN_URL)', async () => {
    const res = await api('/identity/sign-in/begin', { method: 'POST' });
    expect(res.status).toBe(200);
    const { authorizationUrl } = (await res.json()) as { authorizationUrl: string };
    const url = new URL(authorizationUrl);
    // The values set in vitest.integration.config.ts.
    expect(url.searchParams.get('client_id')).toBe('host-test-client.apps.example.test');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://intranet.example.test/sign-in/return',
    );
  });
});
