import { env } from 'cloudflare:test';
import { DatabaseLive, UnitOfWorkLive } from '@arv/db';
import {
  hashSessionToken,
  makeAccessRole,
  makeSession,
  makeUser,
  seedAccessRoles,
  seedAdmin,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { identityPermissions } from '@arv/identity';
import { identityRoutes } from '@arv/identity/http';
import { IdentityConfig, IdentityModuleLive, permissionCatalogLayer } from '@arv/identity/layer';
import { type Actor, CurrentActor } from '@arv/kernel';
import { Effect, Layer } from 'effect';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
// The Google port and adapter are not part of identity's public API; tests reach them by path.
import { GoogleSignIn, SignInRefused } from '../../../../../modules/identity/src/application/ports';
import type { SignInClaims } from '../../../../../modules/identity/src/domain/sign-in-eligibility';
import { makeGoogleSignIn } from '../../../../../modules/identity/src/infrastructure/google-sign-in';
import type { AppEnv } from '../../../src/env';
import { authenticate } from '../../../src/middleware/authenticate';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T17 — sign-in begin and complete, me and sign-out (openapi.yaml `beginSignIn`, `completeSignIn`,
 * `getMe`, `signOut`; AC-01, AC-02, AC-03, AC-15, AC-20).
 *
 * Sign-in runs through a test copy of the host pipeline: the real `authenticate` middleware, then
 * identity's real module Layer on the test database, with Google's code exchange replaced by a fake
 * `GoogleSignIn` (the authorization address is still built by the real adapter). Until T20 reads
 * `IdentityConfig` from env, the host's own composition has no company domain, so every sign-in
 * through it would be refused. `me` and `sign-out` are also checked through the real Worker.
 */

beforeEach(resetDb);

// ---------------------------------------------------------------------------------------------
// Test composition

const COMPANY_DOMAIN = 'example.test'; // the fixtures' default email domain
const FIRST_ADMIN_EMAIL = 'first-admin@example.test';
const VERIFIER = 'v'.repeat(43);
/** Spelled out, not imported: the test must fail if the domain constant drifts from AC-01. */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/** A code the fake treats as Google being unreachable (a defect, 500). */
const GOOGLE_DOWN = 'google-down';

const config: IdentityConfig['Type'] = {
  companyDomain: COMPANY_DOMAIN,
  firstAdminEmail: FIRST_ADMIN_EMAIL,
  signInReturnUrl: 'https://intranet.example.test/sign-in/return',
  googleClientId: 'test-client.apps.example.test',
};

/** What Google reports for each one-time code; an unknown code is one Google rejects. */
const googleCodes = new Map<string, SignInClaims>();

const FakeGoogleSignIn = Layer.succeed(GoogleSignIn, {
  ...makeGoogleSignIn(config, {
    clientSecret: 'test-secret',
    fetch: () => Promise.reject(new Error('no network in tests')),
  }),
  exchangeCode: (code) => {
    if (code === GOOGLE_DOWN) return Effect.dieMessage('identity.google.unavailable');
    const claims = googleCodes.get(code);
    return claims === undefined ? Effect.fail(new SignInRefused()) : Effect.succeed(claims);
  },
});

/** Identity as the host composes it, with the fake Google merged last so it wins. */
const IdentityTestLive = Layer.merge(
  IdentityModuleLive({ google: { clientSecret: 'test-secret' } }),
  FakeGoogleSignIn,
).pipe(
  Layer.provideMerge(
    Layer.merge(permissionCatalogLayer(identityPermissions), Layer.succeed(IdentityConfig, config)),
  ),
);

const testAppLayer = (actor: Actor) =>
  IdentityTestLive.pipe(
    Layer.provideMerge(Layer.merge(UnitOfWorkLive, Layer.succeed(CurrentActor, actor))),
    Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
  );

const testApp = new Hono<AppEnv>()
  .use(authenticate())
  .use(
    createMiddleware<AppEnv>(async (c, next) => {
      c.set('appLayer', testAppLayer(c.get('actor')));
      await next();
    }),
  )
  .route('/', identityRoutes);

type Call = { readonly method?: string; readonly token?: string; readonly body?: unknown };

const request = (path: string, { method = 'GET', token, body }: Call = {}) => {
  const headers = new Headers();
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`http://api.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

/** Through the test pipeline (fake Google, configured company domain). */
const call = (path: string, init?: Call) => testApp.fetch(request(path, init), env);

/** Through the real Worker and its own composition. */
const callHost = (path: string, init?: Call) => {
  const req = request(path, init);
  return api(path, { method: req.method, headers: req.headers, body: req.body });
};

const beginSignIn = () => call('/identity/sign-in/begin', { method: 'POST' });

const completeSignIn = (code: string, codeVerifier = VERIFIER) =>
  call('/identity/sign-in/complete', { method: 'POST', body: { code, codeVerifier } });

let codeCounter = 0;
/** Registers what Google reports for a fresh code and completes sign-in with it. */
const signInAs = (claims: SignInClaims) => {
  codeCounter += 1;
  const code = `code-${codeCounter}`;
  googleCodes.set(code, claims);
  return completeSignIn(code);
};

/** A verified, company-managed Google account on the company domain. */
const company = (email: string, name = 'Google Name'): SignInClaims => ({
  email,
  email_verified: true,
  hd: COMPANY_DOMAIN,
  name,
});

const me = (token?: string) => call('/identity/me', { token });
const signOut = (token?: string) => call('/identity/sign-out', { method: 'POST', token });

// ---------------------------------------------------------------------------------------------
// Database and console observations

type Snapshot = {
  users: Array<{ email: string; name: string }>;
  sessions: Array<{ tokenHash: string; userId: string | null }>;
  roles: Array<{ name: string }>;
  assignments: Array<{ userId: string; accessRoleId: string }>;
};

/** Every identity row that sign-in could touch, for «nothing was recorded» comparisons. */
const snapshot = () =>
  withDb(async (db): Promise<Snapshot> => {
    const users = await db.execute<{ email: string; name: string }>(
      'SELECT email, name FROM identity.users ORDER BY email',
    );
    const sessions = await db.execute<{ tokenHash: string; userId: string | null }>(
      'SELECT token_hash AS "tokenHash", user_id AS "userId" FROM identity.sessions ORDER BY token_hash',
    );
    const roles = await db.execute<{ name: string }>(
      'SELECT name FROM identity.access_roles ORDER BY name',
    );
    const assignments = await db.execute<{ userId: string; accessRoleId: string }>(
      `SELECT user_id AS "userId", access_role_id AS "accessRoleId"
       FROM identity.user_access_roles ORDER BY user_id, access_role_id`,
    );
    return {
      users: users.rows,
      sessions: sessions.rows,
      roles: roles.rows,
      assignments: assignments.rows,
    };
  });

const findUser = (email: string) =>
  withDb(async (db) => {
    const { rows } = await db.execute<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM identity.users WHERE email = '${email}'`,
    );
    return rows[0];
  });

/** `role name → granted keys` for every role the user holds. */
const rolesOf = (userId: string) =>
  withDb(async (db) => {
    const { rows } = await db.execute<{ name: string; keys: string[] | null }>(
      `SELECT r.name, array_agg(p.permission_key ORDER BY p.permission_key)
                FILTER (WHERE p.permission_key IS NOT NULL) AS keys
       FROM identity.user_access_roles ura
       JOIN identity.access_roles r ON r.id = ura.access_role_id
       LEFT JOIN identity.access_role_permissions p ON p.access_role_id = r.id
       WHERE ura.user_id = '${userId}'
       GROUP BY r.name ORDER BY r.name`,
    );
    return Object.fromEntries(rows.map((row) => [row.name, row.keys ?? []]));
  });

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
let consoleSpies: Array<MockInstance>;

beforeEach(() => {
  googleCodes.clear();
  consoleSpies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});
afterEach(() => vi.restoreAllMocks());

/** Everything written to the console during the test, as one string. */
const consoleOutput = () =>
  consoleSpies
    .flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
    .join('\n');

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: Record<string, unknown> }).error;

// ---------------------------------------------------------------------------------------------
// beginSignIn

describe('POST /identity/sign-in/begin', () => {
  it("returns Google's address with a fresh state and the S256 challenge of the verifier", async () => {
    const res = await beginSignIn();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(Object.keys(body).sort()).toEqual(['authorizationUrl', 'codeVerifier', 'state']);
    expect(body.codeVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(body.state).not.toBe('');

    const url = new URL(body.authorizationUrl!);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(config.googleClientId);
    expect(url.searchParams.get('redirect_uri')).toBe(config.signInReturnUrl);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('hd')).toBe(COMPANY_DOMAIN);
    expect(url.searchParams.get('state')).toBe(body.state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(body.codeVerifier),
    );
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
  });

  it('is public, gives a new state and verifier each time and stores nothing', async () => {
    const before = await snapshot();
    const first = (await (await beginSignIn()).json()) as Record<string, string>;
    const second = (await (await beginSignIn()).json()) as Record<string, string>;
    expect(second.state).not.toBe(first.state);
    expect(second.codeVerifier).not.toBe(first.codeVerifier);
    expect(await snapshot()).toEqual(before);
  });

  it('is mounted in the api host and needs no session', async () => {
    const res = await callHost('/identity/sign-in/begin', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ authorizationUrl: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------------------------
// completeSignIn

describe('POST /identity/sign-in/complete', () => {
  describe('a listed user (AC-01)', () => {
    it('gets a session token valid for 7 days, stored only as its hash', async () => {
      const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
      const startedAt = Date.now();
      const res = await signInAs(company(user!.email));
      const finishedAt = Date.now();

      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessionToken: string; expiresAt: string };
      expect(Object.keys(body).sort()).toEqual(['expiresAt', 'sessionToken']);
      expect(body.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const expiresAt = Date.parse(body.expiresAt);
      expect(new Date(expiresAt).toISOString()).toBe(body.expiresAt);
      expect(expiresAt).toBeGreaterThanOrEqual(startedAt + SEVEN_DAYS_MS - 1000);
      expect(expiresAt).toBeLessThanOrEqual(finishedAt + SEVEN_DAYS_MS + 1000);

      const { sessions } = await snapshot();
      expect(sessions).toEqual([
        { tokenHash: await hashSessionToken(body.sessionToken), userId: user!.id },
      ]);
    });

    it('is signed in as that user: the token works on /identity/me', async () => {
      const [user] = await withDb((db) => seedUsers(db, [makeUser({ name: 'Ann Listed' })]));
      const { sessionToken } = (await (
        await signInAs(company(user!.email, 'Ann Google'))
      ).json()) as {
        sessionToken: string;
      };

      const res = await me(sessionToken);
      expect(res.status).toBe(200);
      // The access list's name, not Google's: only the first admin takes Google's name (AC-15).
      expect(await res.json()).toEqual({
        id: user!.id,
        email: user!.email,
        name: 'Ann Listed',
        permissions: [],
      });
    });

    it('matches the listed address regardless of the letter case Google reports', async () => {
      const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
      const res = await signInAs(company(user!.email.toUpperCase()));
      expect(res.status).toBe(200);
      const { sessions } = await snapshot();
      expect(sessions.map((session) => session.userId)).toEqual([user!.id]);
    });

    it('starts a second, independent session on another sign-in', async () => {
      const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
      const first = (await (await signInAs(company(user!.email))).json()) as {
        sessionToken: string;
      };
      const second = (await (await signInAs(company(user!.email))).json()) as {
        sessionToken: string;
      };
      expect(second.sessionToken).not.toBe(first.sessionToken);
      expect((await me(first.sessionToken)).status).toBe(200);
      expect((await me(second.sessionToken)).status).toBe(200);
    });
  });

  describe('a refused Google account (AC-02)', () => {
    const REFUSED = {
      _tag: 'Forbidden',
      code: 'identity.sign_in_refused',
      message: 'Only verified company Google accounts can sign in',
    };

    // Each case is a listed user's address, so only the claim makes the difference.
    it.each<[string, (email: string) => SignInClaims]>([
      [
        'an email Google does not report as verified',
        (email) => ({ ...company(email), email_verified: false }),
      ],
      [
        'an email_verified claim that is not the boolean true',
        (email) => ({ ...company(email), email_verified: 'true' }),
      ],
      [
        'a personal account registered on a company address (no hd)',
        (email) => ({ email, email_verified: true, name: 'Ann' }),
      ],
      [
        'an account managed by another organisation',
        (email) => ({ ...company(email), hd: 'other.test' }),
      ],
      [
        'an address on another domain',
        () => ({ ...company('ann@other.test'), hd: COMPANY_DOMAIN }),
      ],
      ['no email claim', (email) => ({ ...company(email), email: undefined })],
    ])('refuses %s and records nothing', async (_, claimsFor) => {
      const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
      const before = await snapshot();

      const res = await signInAs(claimsFor(user!.email));

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: REFUSED });
      expect(await snapshot()).toEqual(before);
      expect(consoleOutput()).toBe('');
    });

    it('refuses a code Google rejects (reused, expired or forged) with the same generic body', async () => {
      await withDb((db) => seedUsers(db, [makeUser()]));
      const before = await snapshot();

      const res = await completeSignIn('a-code-google-never-issued');

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: REFUSED });
      expect(await snapshot()).toEqual(before);
      expect(consoleOutput()).toBe('');
    });

    it('does not bootstrap the configured first admin from a refused claim', async () => {
      const before = await snapshot();
      const res = await signInAs({ ...company(FIRST_ADMIN_EMAIL), email_verified: false });
      expect(res.status).toBe(403);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('a company person not on the access list (AC-03)', () => {
    it('is told which admins can add them, by name and email only, and nothing is recorded', async () => {
      const { ann, bob } = await withDb(async (db) => {
        const { user: ann, role } = await seedAdmin(db, { name: 'Ann Admin' });
        const [bob, carl] = await seedUsers(db, [
          makeUser({ name: 'Bob Admin' }),
          makeUser({ name: 'Carl Planner' }),
        ]);
        const [planner] = await seedAccessRoles(db, [makeAccessRole({ name: 'Planner' })]);
        await seedUserAccessRoles(db, [
          { userId: bob!.id, accessRoleId: role.id },
          { userId: carl!.id, accessRoleId: planner!.id },
        ]);
        return { ann, bob: bob! };
      });
      const before = await snapshot();

      const res = await signInAs(company(`newcomer@${COMPANY_DOMAIN}`, 'New Comer'));

      expect(res.status).toBe(403);
      const error = await errorOf(res);
      expect(error).toMatchObject({
        _tag: 'Forbidden',
        code: 'identity.not_on_access_list',
        message:
          "You are not on the intranet's access list yet. Ask one of these admins to add you.",
      });
      const admins = (error.details as { admins: Array<Record<string, string>> }).admins;
      expect([...admins].sort((a, b) => a.email!.localeCompare(b.email!))).toEqual(
        [
          { name: ann.name, email: ann.email },
          { name: bob.name, email: bob.email },
        ].sort((a, b) => a.email.localeCompare(b.email)),
      );
      expect(await snapshot()).toEqual(before);
      expect(consoleOutput()).not.toContain('newcomer');
    });

    it('is told to ask their manager when there is no admin', async () => {
      await withDb((db) => seedUsers(db, [makeUser()]));
      const before = await snapshot();

      const res = await signInAs(company(`newcomer@${COMPANY_DOMAIN}`));

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: {
          _tag: 'Forbidden',
          code: 'identity.not_on_access_list',
          message: "You are not on the intranet's access list yet. Ask your manager.",
          details: { admins: [] },
        },
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('the configured first admin (AC-15)', () => {
    it('is put on the list under Google’s name with «Admin» when nobody holds manage access', async () => {
      // A role named «Admin» exists without manage access: it is reused, not duplicated.
      await withDb((db) =>
        seedAccessRoles(db, [makeAccessRole({ name: 'Admin', permissionKeys: [] })]),
      );

      const res = await signInAs(company(FIRST_ADMIN_EMAIL, 'First Admin'));

      expect(res.status).toBe(200);
      const { sessionToken } = (await res.json()) as { sessionToken: string };
      const user = await findUser(FIRST_ADMIN_EMAIL);
      expect(user).toMatchObject({ email: FIRST_ADMIN_EMAIL, name: 'First Admin' });
      expect(await rolesOf(user!.id)).toEqual({ Admin: ['identity:manage-access'] });
      expect((await snapshot()).roles).toEqual([{ name: 'Admin' }]);

      const meRes = await me(sessionToken);
      expect(await meRes.json()).toEqual({
        id: user!.id,
        email: FIRST_ADMIN_EMAIL,
        name: 'First Admin',
        permissions: ['identity:manage-access'],
      });
    });

    it('keeps an already listed first admin’s roles and adds «Admin»', async () => {
      const listed = await withDb(async (db) => {
        const [user] = await seedUsers(db, [
          makeUser({ email: FIRST_ADMIN_EMAIL, name: 'Old Name' }),
        ]);
        const [planner] = await seedAccessRoles(db, [
          makeAccessRole({ name: 'Planner', permissionKeys: ['scheduling:view-whole-board'] }),
        ]);
        await seedUserAccessRoles(db, [{ userId: user!.id, accessRoleId: planner!.id }]);
        return user!;
      });

      const res = await signInAs(company(FIRST_ADMIN_EMAIL, 'First Admin'));

      expect(res.status).toBe(200);
      expect(await findUser(FIRST_ADMIN_EMAIL)).toEqual({
        id: listed.id,
        email: FIRST_ADMIN_EMAIL,
        name: 'First Admin',
      });
      expect(await rolesOf(listed.id)).toEqual({
        Admin: ['identity:manage-access'],
        Planner: ['scheduling:view-whole-board'],
      });
    });

    it('grants nothing once an admin exists: an unlisted configured address is not set up', async () => {
      const { user: admin } = await withDb((db) => seedAdmin(db));
      const before = await snapshot();

      const res = await signInAs(company(FIRST_ADMIN_EMAIL, 'First Admin'));

      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        error: {
          code: 'identity.not_on_access_list',
          details: { admins: [{ name: admin.name, email: admin.email }] },
        },
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('request validation', () => {
    it.each([
      ['no code', { codeVerifier: VERIFIER }],
      ['an empty code', { code: '', codeVerifier: VERIFIER }],
      ['a verifier shorter than 43 characters', { code: 'code', codeVerifier: 'v'.repeat(42) }],
      [
        'a verifier with characters outside RFC 7636',
        { code: 'code', codeVerifier: `${'v'.repeat(42)}!` },
      ],
      ['an unknown property', { code: 'code', codeVerifier: VERIFIER, state: 'st' }],
    ])('answers 400 for %s', async (_, body) => {
      const res = await call('/identity/sign-in/complete', { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toMatchObject({
        _tag: 'ValidationError',
        code: 'platform.validation_failed',
      });
    });
  });

  it('answers 500 and stores nothing when Google is unreachable', async () => {
    const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
    const before = await snapshot();

    const res = await completeSignIn(GOOGLE_DOWN);

    expect(res.status).toBe(500);
    expect(await errorOf(res)).toMatchObject({
      _tag: 'InternalError',
      code: 'platform.internal_error',
    });
    expect(await snapshot()).toEqual(before);
    expect(consoleOutput()).not.toContain(user!.email);
  });
});

// ---------------------------------------------------------------------------------------------
// getMe

describe('GET /identity/me', () => {
  const UNAUTHENTICATED = {
    _tag: 'Unauthenticated',
    code: 'platform.unauthenticated',
    message: 'Sign in to continue',
  };

  it('returns the user and the declared permission keys their roles grant now', async () => {
    const { user, session } = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const roles = await seedAccessRoles(db, [
        // Granted twice through two roles: listed once.
        makeAccessRole({ name: 'Admin', permissionKeys: ['identity:manage-access'] }),
        // No module declares this key in the catalog: it grants nothing (AC-16, AC-18).
        makeAccessRole({
          name: 'Planner',
          permissionKeys: ['identity:manage-access', 'scheduling:edit-allocations'],
        }),
      ]);
      await seedUserAccessRoles(
        db,
        roles.map((role) => ({ userId: user!.id, accessRoleId: role.id })),
      );
      const [session] = await seedSessions(db, [makeSession({ userId: user!.id })]);
      return { user: user!, session: session! };
    });

    const res = await callHost('/identity/me', { token: session.token });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      permissions: ['identity:manage-access'],
    });
  });

  it('answers 401 without a session', async () => {
    const res = await callHost('/identity/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: UNAUTHENTICATED });
  });

  it('answers 401 for a token that matches no session', async () => {
    await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      await seedSessions(db, [makeSession({ userId: user!.id })]);
    });
    const res = await callHost('/identity/me', { token: 'x'.repeat(43) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: UNAUTHENTICATED });
  });

  it('answers 401 once the session is past its 7 days (AC-20)', async () => {
    const session = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [session] = await seedSessions(db, [
        makeSession({ userId: user!.id, expiresAt: new Date(Date.now() - 1000) }),
      ]);
      return session!;
    });
    const res = await callHost('/identity/me', { token: session.token });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: UNAUTHENTICATED });
  });
});

// ---------------------------------------------------------------------------------------------
// signOut

describe('POST /identity/sign-out (AC-20)', () => {
  it('ends a session started by sign-in: the same token then gets 401 on /identity/me', async () => {
    const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
    const { sessionToken } = (await (await signInAs(company(user!.email))).json()) as {
      sessionToken: string;
    };
    expect((await me(sessionToken)).status).toBe(200);

    const res = await signOut(sessionToken);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    const after = await me(sessionToken);
    expect(after.status).toBe(401);
    expect(await errorOf(after)).toMatchObject({ code: 'platform.unauthenticated' });
  });

  it('ends only this session: the copied token is refused, the other device stays signed in', async () => {
    const { thisDevice, otherDevice } = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [thisDevice, otherDevice] = await seedSessions(db, [
        makeSession({ userId: user!.id }),
        makeSession({ userId: user!.id }),
      ]);
      return { thisDevice: thisDevice!, otherDevice: otherDevice! };
    });

    const res = await callHost('/identity/sign-out', { method: 'POST', token: thisDevice.token });

    expect(res.status).toBe(204);
    expect((await callHost('/identity/me', { token: thisDevice.token })).status).toBe(401);
    expect((await callHost('/identity/me', { token: otherDevice.token })).status).toBe(200);
    // The row is gone, not just marked: a copy of the token can never be used again.
    expect((await snapshot()).sessions).toEqual([
      { tokenHash: otherDevice.tokenHash, userId: otherDevice.userId },
    ]);
  });

  it('answers 401 without a session and ends nothing', async () => {
    await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      await seedSessions(db, [makeSession({ userId: user!.id })]);
    });
    const before = await snapshot();

    const res = await signOut();

    expect(res.status).toBe(401);
    expect(await snapshot()).toEqual(before);
  });
});
