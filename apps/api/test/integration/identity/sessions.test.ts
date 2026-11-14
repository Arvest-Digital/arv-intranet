import { makeSession, makeUser, seedAdmin, seedSessions, seedUsers } from '@arv/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withDb } from '../../helpers';
import { type Call, errorOf, makeTestApp, request } from './qg1-pipeline';

/**
 * T21 — QG-1 scenario 1b, Session lifetime (sad §10; PRD §6 Session lifetime; AC-07, AC-20).
 *
 * Each session is used once before it ends, so a cache of sessions would keep serving it and fail
 * these tests.
 */

beforeEach(resetDb);

const app = makeTestApp();
const call = (path: string, init?: Call) => app.fetch(request(path, init));
const me = (token: string) => call('/identity/me', { token });

/** A user with two live sessions (two devices) and an admin with one. */
const setup = () =>
  withDb(async (db) => {
    const { user: admin } = await seedAdmin(db);
    const [user] = await seedUsers(db, [makeUser()]);
    const [adminSession, laptop, phone] = await seedSessions(db, [
      makeSession({ userId: admin.id }),
      makeSession({ userId: user!.id }),
      makeSession({ userId: user!.id }),
    ]);
    return {
      admin: { ...admin, token: adminSession!.token },
      user: user!,
      laptop: laptop!,
      phone: phone!,
    };
  });

const backDate = (sessionId: string) =>
  withDb((db) =>
    db.execute(
      `UPDATE identity.sessions SET expires_at = now() - interval '1 second' WHERE id = '${sessionId}'`,
    ),
  );

const expectSignInAgain = async (res: Response) => {
  expect(res.status).toBe(401);
  expect(await errorOf(res)).toMatchObject({
    _tag: 'Unauthenticated',
    code: 'platform.unauthenticated',
  });
};

describe('session lifetime (QG-1 1b)', () => {
  it('refuses a session whose 7 days have passed (AC-20)', async () => {
    const { user } = await setup();
    const [expired] = await withDb((db) =>
      seedSessions(db, [makeSession({ userId: user.id, expiresAt: new Date(Date.now() - 1000) })]),
    );

    await expectSignInAgain(await me(expired!.token));
  });

  it('refuses a session from the request after it expires, while the other device stays signed in (AC-20)', async () => {
    const { laptop, phone } = await setup();
    expect((await me(laptop.token)).status).toBe(200);

    await backDate(laptop.id);

    await expectSignInAgain(await me(laptop.token));
    expect((await me(phone.token)).status).toBe(200);
  });

  it('refuses a replayed signed-out token while the user’s second session works (AC-20)', async () => {
    const { laptop, phone } = await setup();
    expect((await me(laptop.token)).status).toBe(200);

    const signedOut = await call('/identity/sign-out', { method: 'POST', token: laptop.token });
    expect(signedOut.status).toBe(204);

    // The copied token, replayed on any route, is refused.
    await expectSignInAgain(await me(laptop.token));
    expect((await call('/identity/sign-out', { method: 'POST', token: laptop.token })).status).toBe(
      401,
    );
    expect((await me(phone.token)).status).toBe(200);
  });

  it('ends every session of a removed user; the admin stays signed in (AC-07)', async () => {
    const { admin, user, laptop, phone } = await setup();
    for (const session of [laptop, phone]) expect((await me(session.token)).status).toBe(200);

    const removed = await call(`/users/${user.id}`, { method: 'DELETE', token: admin.token });
    expect(removed.status).toBe(204);

    for (const session of [laptop, phone]) {
      const res = await me(session.token);
      expect(res.status).toBe(401);
      expect(await errorOf(res)).toMatchObject({ code: 'identity.access_removed' });
    }
    expect((await me(admin.token)).status).toBe(200);
  });
});
