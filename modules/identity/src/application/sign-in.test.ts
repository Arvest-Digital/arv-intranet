import { Effect, Either, Layer, TestClock, TestContext } from 'effect';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { hashSessionToken } from '../domain/session';
import type { SignInClaims } from '../domain/sign-in-eligibility';
import { MANAGE_ACCESS } from '../permissions';
import { beginSignIn, pkceChallenge } from './begin-sign-in';
import { completeSignIn, SIGN_IN_SUCCEEDED_EVENT } from './complete-sign-in';
import { SessionRepository } from './ports';
import { type IdentityFakes, makeIdentityFakes } from './testing';

const NOW = Date.parse('2026-03-02T09:00:00.000Z');
const VERIFIER = 'v'.repeat(43);
/** Spelled out, not imported: the test must fail if the domain constant drifts from AC-01. */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const claimsFor = (email: string, name = 'Google Name'): SignInClaims => ({
  email,
  email_verified: true,
  hd: 'arvest.digital',
  name,
});

const run = <A, E, R>(fakes: IdentityFakes, effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.either(
      TestClock.setTime(NOW).pipe(
        Effect.zipRight(effect),
        Effect.provide(fakes.layer as Layer.Layer<R>),
        Effect.provide(TestContext.TestContext),
      ),
    ),
  );

const signIn = (fakes: IdentityFakes, claims: SignInClaims, code = 'code-1') => {
  fakes.googleReturns(code, claims);
  return run(fakes, completeSignIn(code, VERIFIER));
};

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
let consoleSpies: Array<MockInstance>;

beforeEach(() => {
  consoleSpies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
});
afterEach(() => vi.restoreAllMocks());

/** Every line written to the console, parsed as JSON. */
const logged = () =>
  consoleSpies.flatMap((spy) => spy.mock.calls.map((args) => JSON.parse(String(args[0]))));

/** The whole store as plain data, for «nothing was stored» comparisons. */
const stored = (fakes: IdentityFakes) => {
  const { users, roles, sessions, userRoles } = fakes.snapshot();
  return { users, roles, sessions, assignments: users.map((u) => [u.id, userRoles(u.id)]) };
};

/** A store with one admin (Ann, holding «Admin») and one ordinary listed user (Bob). */
const withAdmin = () => {
  const fakes = makeIdentityFakes();
  const admin = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
  const planner = fakes.seedRole({ name: 'Planner' });
  const ann = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [admin.id]);
  const bob = fakes.seedUser({ email: 'bob@arvest.digital', name: 'Bob' }, [planner.id]);
  return { fakes, admin, planner, ann, bob };
};

describe('beginSignIn', () => {
  it('returns Google’s address with a fresh state and the S256 challenge of the verifier', async () => {
    const fakes = makeIdentityFakes();
    const first = Either.getOrThrow(await run(fakes, beginSignIn()));
    const second = Either.getOrThrow(await run(fakes, beginSignIn()));

    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const url = new URL(first.authorizationUrl);
    expect(url.searchParams.get('state')).toBe(first.state);
    expect(url.searchParams.get('code_challenge')).toBe(
      await Effect.runPromise(pkceChallenge(first.codeVerifier)),
    );
    expect(second.state).not.toBe(first.state);
    expect(second.codeVerifier).not.toBe(first.codeVerifier);
  });

  it('computes the RFC 7636 appendix B challenge', async () => {
    expect(
      await Effect.runPromise(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')),
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('completeSignIn: a listed user (AC-01)', () => {
  it('creates a session expiring 7 days from now and returns its token once', async () => {
    const { fakes, bob } = withAdmin();
    const result = Either.getOrThrow(await signIn(fakes, claimsFor('bob@arvest.digital')));

    expect(result.userId).toBe(bob.id);
    expect(result.expiresAt).toEqual(new Date(NOW + SEVEN_DAYS_MS));
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const tokenHash = await Effect.runPromise(hashSessionToken(result.sessionToken));
    expect(fakes.snapshot().sessions).toEqual([
      { tokenHash, userId: bob.id, expiresAt: result.expiresAt, revokedReason: null },
    ]);
  });

  it('matches the email case-insensitively and does not touch the listed user', async () => {
    const { fakes, bob, planner } = withAdmin();
    const result = await signIn(fakes, claimsFor(' Bob@Arvest.Digital ', 'Robert'));

    expect(Either.getOrThrow(result).userId).toBe(bob.id);
    const after = fakes.snapshot();
    expect(after.users.find((u) => u.id === bob.id)?.name).toBe('Bob');
    expect(after.userRoles(bob.id)).toEqual([planner.id]);
  });

  it('exchanges the code with the verifier outside any transaction', async () => {
    const { fakes } = withAdmin();
    await signIn(fakes, claimsFor('bob@arvest.digital'), 'the-code');
    expect(fakes.googleExchanges()).toEqual([
      { code: 'the-code', codeVerifier: VERIFIER, inTransaction: false },
    ]);
  });

  it('purges expired sessions and keeps live ones', async () => {
    const { fakes, ann } = withAdmin();
    fakes.seedSession({
      tokenHash: 'expired' as never,
      userId: ann.id,
      expiresAt: new Date(NOW - 1),
    });
    fakes.seedSession({ tokenHash: 'live' as never, userId: ann.id, expiresAt: new Date(NOW + 1) });
    await signIn(fakes, claimsFor('bob@arvest.digital'));

    const hashes = fakes.snapshot().sessions.map((s) => s.tokenHash);
    expect(hashes).toContain('live');
    expect(hashes).not.toContain('expired');
    expect(hashes).toHaveLength(2);
  });

  it('logs only identity.sign_in.succeeded with the userId', async () => {
    const { fakes, bob } = withAdmin();
    await signIn(fakes, claimsFor('bob@arvest.digital'));
    expect(logged()).toEqual([{ event: SIGN_IN_SUCCEEDED_EVENT, userId: bob.id }]);
  });
});

describe('completeSignIn: refused claims (AC-02)', () => {
  const listed = claimsFor('bob@arvest.digital');
  it.each<[string, SignInClaims]>([
    ['an unverified email', { ...listed, email_verified: false }],
    ['a missing email_verified', { ...listed, email_verified: undefined }],
    ['a personal account (no hd)', { ...listed, hd: undefined }],
    ['another organisation', { ...listed, hd: 'other.example' }],
    ['an email on another domain', { ...listed, email: 'bob@other.example' }],
    ['a missing email', { ...listed, email: undefined }],
    ['a missing name', { ...listed, name: undefined }],
  ])('refuses %s, storing and logging nothing', async (_, claims) => {
    const { fakes } = withAdmin();
    const before = stored(fakes);
    const result = await signIn(fakes, claims);

    expect(Either.isLeft(result) && result.left._tag).toBe('SignInRefused');
    expect(stored(fakes)).toEqual(before);
    expect(logged()).toEqual([]);
  });

  it('refuses a code Google rejects, storing and logging nothing', async () => {
    const { fakes } = withAdmin();
    const before = stored(fakes);
    const result = await run(fakes, completeSignIn('unknown-code', VERIFIER));

    expect(Either.isLeft(result) && result.left._tag).toBe('SignInRefused');
    expect(stored(fakes)).toEqual(before);
    expect(logged()).toEqual([]);
  });

  it('refuses the configured first admin with refused claims, even with no admin', async () => {
    const fakes = makeIdentityFakes();
    const result = await signIn(fakes, {
      ...claimsFor(fakes.config.firstAdminEmail),
      email_verified: false,
    });
    expect(Either.isLeft(result) && result.left._tag).toBe('SignInRefused');
    expect(fakes.snapshot().users).toEqual([]);
  });
});

describe('completeSignIn: not on the access list (AC-03)', () => {
  it('answers NotSetUp with the admins’ names and emails, storing and logging nothing', async () => {
    const { fakes } = withAdmin();
    const before = stored(fakes);
    const result = await signIn(fakes, claimsFor('carol@arvest.digital'));

    expect(result).toEqual(
      Either.left(
        expect.objectContaining({
          _tag: 'NotSetUp',
          admins: [{ name: 'Ann', email: 'ann@arvest.digital' }],
        }),
      ),
    );
    expect(stored(fakes)).toEqual(before);
    expect(logged()).toEqual([]);
  });

  it('answers NotSetUp with an empty list when nobody holds manage access', async () => {
    const fakes = makeIdentityFakes();
    fakes.seedUser({ email: 'bob@arvest.digital', name: 'Bob' });
    const result = await signIn(fakes, claimsFor('carol@arvest.digital'));

    expect(Either.isLeft(result) && result.left).toMatchObject({ _tag: 'NotSetUp', admins: [] });
    expect(fakes.snapshot().roles).toEqual([]);
  });

  it('answers NotSetUp for the first-admin address when no first admin is configured', async () => {
    const fakes = makeIdentityFakes({ config: { firstAdminEmail: '' } });
    const result = await signIn(fakes, claimsFor('first.admin@arvest.digital'));
    expect(Either.isLeft(result) && result.left).toMatchObject({ _tag: 'NotSetUp', admins: [] });
    expect(fakes.snapshot().users).toEqual([]);
  });
});

describe('completeSignIn: first admin (AC-15)', () => {
  const adminRoleOf = (fakes: IdentityFakes) =>
    fakes.snapshot().roles.find((r) => r.name === 'Admin');

  it('puts the configured address on the list under Google’s name as admin while no admin exists', async () => {
    const fakes = makeIdentityFakes();
    const result = Either.getOrThrow(
      await signIn(fakes, claimsFor('First.Admin@arvest.digital', '  Fiona Admin ')),
    );

    const { users, roles, userRoles, sessions } = fakes.snapshot();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: result.userId,
      email: 'first.admin@arvest.digital',
      name: 'Fiona Admin',
    });
    expect(roles).toEqual([
      expect.objectContaining({ name: 'Admin', permissionKeys: [MANAGE_ACCESS], holderCount: 1 }),
    ]);
    expect(userRoles(result.userId)).toEqual([roles[0]?.id]);
    expect(sessions).toHaveLength(1);
    expect(logged()).toEqual([{ event: SIGN_IN_SUCCEEDED_EVENT, userId: result.userId }]);
  });

  it('keeps the roles of an already listed first admin, adds «Admin» and takes Google’s name', async () => {
    const fakes = makeIdentityFakes();
    const planner = fakes.seedRole({ name: 'Planner', permissionKeys: ['scheduling:plan'] });
    const fiona = fakes.seedUser({ email: 'first.admin@arvest.digital', name: 'Fi' }, [planner.id]);
    const result = Either.getOrThrow(
      await signIn(fakes, claimsFor('first.admin@arvest.digital', 'Fiona Admin')),
    );

    expect(result.userId).toBe(fiona.id);
    const admin = adminRoleOf(fakes);
    expect(fakes.snapshot().userRoles(fiona.id)).toEqual([planner.id, admin?.id]);
    expect(fakes.snapshot().users).toEqual([
      expect.objectContaining({ id: fiona.id, name: 'Fiona Admin' }),
    ]);
  });

  it('reuses an existing «Admin» role, adding manage access to its keys', async () => {
    const fakes = makeIdentityFakes();
    const existing = fakes.seedRole({ name: ' admin ', permissionKeys: ['scheduling:plan'] });
    const result = Either.getOrThrow(await signIn(fakes, claimsFor('first.admin@arvest.digital')));

    const { roles, userRoles } = fakes.snapshot();
    expect(roles).toHaveLength(1);
    expect(roles[0]?.id).toBe(existing.id);
    expect([...(roles[0]?.permissionKeys ?? [])].sort()).toEqual([
      MANAGE_ACCESS,
      'scheduling:plan',
    ]);
    expect(userRoles(result.userId)).toEqual([existing.id]);
  });

  it('gives an unlisted configured address nothing once an admin exists', async () => {
    const { fakes } = withAdmin();
    const before = stored(fakes);
    const result = await signIn(fakes, claimsFor('first.admin@arvest.digital'));

    expect(Either.isLeft(result) && result.left).toMatchObject({
      _tag: 'NotSetUp',
      admins: [{ name: 'Ann', email: 'ann@arvest.digital' }],
    });
    expect(stored(fakes)).toEqual(before);
  });

  it('signs a listed configured address in with no extra role once an admin exists', async () => {
    const { fakes, planner } = withAdmin();
    const fiona = fakes.seedUser({ email: 'first.admin@arvest.digital', name: 'Fi' }, [planner.id]);
    const rolesBefore = fakes.snapshot().roles;
    const result = Either.getOrThrow(
      await signIn(fakes, claimsFor('first.admin@arvest.digital', 'Fiona Admin')),
    );

    expect(result.userId).toBe(fiona.id);
    const after = fakes.snapshot();
    expect(after.userRoles(fiona.id)).toEqual([planner.id]);
    expect(after.roles).toEqual(rolesBefore);
    expect(after.users.find((u) => u.id === fiona.id)?.name).toBe('Fi');
  });

  it('becomes admin only once: a second sign-in adds nothing', async () => {
    const fakes = makeIdentityFakes();
    const first = Either.getOrThrow(await signIn(fakes, claimsFor('first.admin@arvest.digital')));
    const rolesAfterFirst = fakes.snapshot().roles;
    const second = Either.getOrThrow(
      await signIn(fakes, claimsFor('first.admin@arvest.digital'), 'code-2'),
    );

    expect(second.userId).toBe(first.userId);
    expect(fakes.snapshot().roles).toEqual(rolesAfterFirst);
    expect(fakes.snapshot().userRoles(first.userId)).toHaveLength(1);
  });

  it('rolls the bootstrap back when creating the session fails', async () => {
    const fakes = makeIdentityFakes();
    fakes.googleReturns('code-1', claimsFor('first.admin@arvest.digital'));
    const broken = Layer.succeed(SessionRepository, {
      ...fakes.sessions,
      create: () => Effect.dieMessage('db down'),
    });
    const exit = await Effect.runPromiseExit(
      completeSignIn('code-1', VERIFIER).pipe(Effect.provide(Layer.merge(fakes.layer, broken))),
    );

    expect(exit._tag).toBe('Failure');
    expect(fakes.snapshot().users).toEqual([]);
    expect(fakes.snapshot().roles).toEqual([]);
    expect(logged()).toEqual([]);
  });
});
