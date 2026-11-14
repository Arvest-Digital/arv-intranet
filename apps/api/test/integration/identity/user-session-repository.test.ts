import { env } from 'cloudflare:test';
import { DatabaseLive, UnitOfWorkLive } from '@arv/db';
import {
  hashSessionToken,
  makeAccessRole,
  makeSession,
  makeUser,
  seedAccessRoles,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { UnitOfWork, UserId } from '@arv/kernel';
import { Effect, Exit, Layer, Option, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
// The adapters are not part of identity's public API (wired in its Layer); tests reach them by path.
import {
  AccessRoleId,
  SessionRepository,
  UserRepository,
} from '../../../../../modules/identity/src/application/ports';
import { EmailTaken } from '../../../../../modules/identity/src/domain/errors';
import type { SessionTokenHash } from '../../../../../modules/identity/src/domain/session';
import { normaliseEmail, UserName } from '../../../../../modules/identity/src/domain/user';
import { DrizzleSessionRepositoryLive } from '../../../../../modules/identity/src/infrastructure/drizzle-session-repository';
import { DrizzleUserRepositoryLive } from '../../../../../modules/identity/src/infrastructure/drizzle-user-repository';
import { resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

const TestLayer = Layer.mergeAll(
  DrizzleUserRepositoryLive,
  DrizzleSessionRepositoryLive,
  UnitOfWorkLive,
).pipe(Layer.provideMerge(DatabaseLive(env.HYPERDRIVE.connectionString)));

type Services = UserRepository | SessionRepository | UnitOfWork;

const run = <A, E>(effect: Effect.Effect<A, E, Services>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

const runExit = <A, E>(effect: Effect.Effect<A, E, Services>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(TestLayer)));

const users = UserRepository;
const sessions = SessionRepository;

const hash = async (token: string) => (await hashSessionToken(token)) as SessionTokenHash;
const roleId = (id: string) => AccessRoleId.make(id);
const userId = (id: string) => UserId.make(id);

const resolve = (tokenHash: SessionTokenHash) =>
  run(Effect.flatMap(sessions, (repo) => repo.resolve(tokenHash)));

/** Session rows as stored, read on a separate connection. */
const storedSessions = () =>
  withDb(async (db) => {
    const { rows } = await db.execute<{
      tokenHash: string;
      userId: string | null;
      revokedReason: string | null;
    }>(
      `SELECT token_hash AS "tokenHash", user_id AS "userId", revoked_reason AS "revokedReason"
       FROM identity.sessions ORDER BY token_hash`,
    );
    return rows;
  });

describe('DrizzleSessionRepository.resolve', () => {
  it('returns the union of keys across several roles (AC-12)', async () => {
    const { user, session, expiresAt } = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const roles = await seedAccessRoles(db, [
        makeAccessRole({ permissionKeys: ['a:one', 'a:two'] }),
        makeAccessRole({ permissionKeys: ['a:two', 'a:three'] }),
        makeAccessRole({ permissionKeys: ['a:unheld'] }),
      ]);
      await seedUserAccessRoles(db, [
        { userId: user!.id, accessRoleId: roles[0]!.id },
        { userId: user!.id, accessRoleId: roles[1]!.id },
      ]);
      const seed = makeSession({ userId: user!.id });
      const [session] = await seedSessions(db, [seed]);
      return { user: user!, session: session!, expiresAt: seed.expiresAt };
    });

    const resolved = Option.getOrThrow(await resolve(await hash(session.token)));
    expect(resolved.userId).toBe(user.id);
    expect(resolved.revokedReason).toBeNull();
    // Compare with the seeded input: the raw-SQL fixture returns `expires_at` as a string at runtime.
    expect(resolved.expiresAt).toBeInstanceOf(Date);
    expect(resolved.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect([...resolved.grantedKeys].sort()).toEqual(['a:one', 'a:three', 'a:two']);
  });

  it('returns no keys for a user without roles', async () => {
    const session = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [session] = await seedSessions(db, [makeSession({ userId: user!.id })]);
      return session!;
    });

    const resolved = Option.getOrThrow(await resolve(await hash(session.token)));
    expect(resolved.grantedKeys).toEqual([]);
  });

  it('reports an expired session by its past expiry', async () => {
    const expiresAt = new Date(Date.now() - 60_000);
    const session = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [session] = await seedSessions(db, [makeSession({ userId: user!.id, expiresAt })]);
      return session!;
    });

    const resolved = Option.getOrThrow(await resolve(await hash(session.token)));
    expect(resolved.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(resolved.expiresAt.getTime()).toBeLessThan(Date.now());
    expect(resolved.revokedReason).toBeNull();
  });

  it('reports a revoked session with its reason', async () => {
    const session = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [session] = await seedSessions(db, [
        makeSession({ userId: user!.id, revokedReason: 'access-removed' }),
      ]);
      return session!;
    });

    const resolved = Option.getOrThrow(await resolve(await hash(session.token)));
    expect(resolved.revokedReason).toBe('access-removed');
  });

  it('returns None for an unknown hash', async () => {
    await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      await seedSessions(db, [makeSession({ userId: user!.id })]);
    });

    expect(Option.isNone(await resolve(await hash('not-a-real-token')))).toBe(true);
  });
});

describe('DrizzleSessionRepository writes', () => {
  it('creates a session that resolves to its user', async () => {
    const [user] = await withDb((db) => seedUsers(db, [makeUser()]));
    const tokenHash = await hash('token-create');
    const expiresAt = new Date(Date.now() + 3_600_000);

    await run(
      Effect.flatMap(sessions, (repo) =>
        repo.create({ tokenHash, userId: userId(user!.id), expiresAt }),
      ),
    );

    const resolved = Option.getOrThrow(await resolve(tokenHash));
    expect(resolved).toMatchObject({ userId: user!.id, revokedReason: null, grantedKeys: [] });
    expect(resolved.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('deleteByHash removes only that session (AC-20)', async () => {
    const [mine, other] = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      return seedSessions(db, [
        makeSession({ userId: user!.id }),
        makeSession({ userId: user!.id }),
      ]);
    });

    const [deleted, again] = await run(
      Effect.flatMap(sessions, (repo) =>
        Effect.zip(
          Effect.promise(() => hash(mine!.token)).pipe(Effect.flatMap(repo.deleteByHash)),
          Effect.promise(() => hash(mine!.token)).pipe(Effect.flatMap(repo.deleteByHash)),
        ),
      ),
    );

    expect([deleted, again]).toEqual([true, false]);
    expect((await storedSessions()).map((row) => row.tokenHash)).toEqual([other!.tokenHash]);
  });

  it('purgeExpired deletes only sessions past their expiry', async () => {
    const live = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [live] = await seedSessions(db, [
        makeSession({ userId: user!.id }),
        makeSession({ userId: user!.id, expiresAt: new Date(Date.now() - 60_000) }),
        makeSession({
          userId: null,
          expiresAt: new Date(Date.now() - 60_000),
          revokedReason: 'access-removed',
        }),
      ]);
      return live!;
    });

    await run(Effect.flatMap(sessions, (repo) => repo.purgeExpired()));

    expect((await storedSessions()).map((row) => row.tokenHash)).toEqual([live.tokenHash]);
  });
});

describe('DrizzleUserRepository', () => {
  it('a differently-cased email after «anna@» fails EmailTaken (AC-06)', async () => {
    const exit = await runExit(
      Effect.flatMap(users, (repo) =>
        repo
          .create({ email: 'anna@example.test', name: 'Test User A' })
          // The domain normalises before the port; the stored and compared form is lower case.
          .pipe(
            Effect.zipRight(
              repo.create({ email: normaliseEmail(' Anna@example.test'), name: 'Test User B' }),
            ),
          ),
      ),
    );

    expect(exit).toEqual(Exit.fail(new EmailTaken({ email: 'anna@example.test' })));
  });

  it('a taken email inside a UnitOfWork leaves the transaction usable', async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* users;
        const uow = yield* UnitOfWork;
        return yield* uow.transactional(
          Effect.gen(function* () {
            yield* repo.create({ email: 'anna@example.test', name: 'Test User A' });
            const taken = yield* Effect.either(
              repo.create({ email: 'anna@example.test', name: 'Test User B' }),
            );
            const bob = yield* repo.create({ email: 'bob@example.test', name: 'Test User C' });
            return { taken: taken._tag, bob: bob.email };
          }),
        );
      }),
    );

    expect(result).toEqual({ taken: 'Left', bob: 'bob@example.test' });
    const listed = await run(Effect.flatMap(users, (repo) => repo.list()));
    expect(listed.map((user) => user.email).sort()).toEqual([
      'anna@example.test',
      'bob@example.test',
    ]);
  });

  it('creates a user holding the given access roles', async () => {
    const roles = await withDb((db) =>
      seedAccessRoles(db, [makeAccessRole(), makeAccessRole(), makeAccessRole()]),
    );

    const { created, held } = await run(
      Effect.gen(function* () {
        const repo = yield* users;
        const created = yield* repo.create({ email: 'anna@example.test', name: 'Test User A' }, [
          roleId(roles[0]!.id),
          roleId(roles[2]!.id),
        ]);
        return { created, held: yield* repo.accessRoleIds(created.id) };
      }),
    );

    expect(created).toMatchObject({ email: 'anna@example.test', name: 'Test User A' });
    expect(created.id[14]).toBe('7');
    expect([...held].sort()).toEqual([roles[0]!.id, roles[2]!.id].sort());
  });

  it('finds by id and by email, None when absent', async () => {
    const [seeded] = await withDb((db) => seedUsers(db, [makeUser(), makeUser()]));

    const found = await run(
      Effect.gen(function* () {
        const repo = yield* users;
        return {
          byId: yield* repo.findById(userId(seeded!.id)),
          byEmail: yield* repo.findByEmail(seeded!.email),
          missing: yield* repo.findByEmail('nobody@example.test'),
        };
      }),
    );

    expect(Option.getOrThrow(found.byId).email).toBe(seeded!.email);
    expect(Option.getOrThrow(found.byEmail).id).toBe(seeded!.id);
    expect(Option.isNone(found.missing)).toBe(true);
  });

  it('rename changes only the name and keeps assignments (AC-21)', async () => {
    const { user, role } = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const [role] = await seedAccessRoles(db, [makeAccessRole()]);
      await seedUserAccessRoles(db, [{ userId: user!.id, accessRoleId: role!.id }]);
      return { user: user!, role: role! };
    });
    const newName = Schema.decodeSync(UserName)('  Test User Renamed ');

    const { renamed, missing, held } = await run(
      Effect.gen(function* () {
        const repo = yield* users;
        return {
          renamed: yield* repo.rename(userId(user.id), newName),
          missing: yield* repo.rename(userId('6f1c1f0e-4d6a-7b8e-9b3a-2f0a3c5d7e91'), newName),
          held: yield* repo.accessRoleIds(userId(user.id)),
        };
      }),
    );

    expect(Option.getOrThrow(renamed)).toMatchObject({
      id: user.id,
      email: user.email,
      name: 'Test User Renamed',
    });
    expect(Option.isNone(missing)).toBe(true);
    expect(held).toEqual([role.id]);
  });

  it('setAccessRoles replaces the set of roles the user holds', async () => {
    const { user, roles } = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const roles = await seedAccessRoles(db, [
        makeAccessRole(),
        makeAccessRole(),
        makeAccessRole(),
      ]);
      await seedUserAccessRoles(db, [
        { userId: user!.id, accessRoleId: roles[0]!.id },
        { userId: user!.id, accessRoleId: roles[1]!.id },
      ]);
      return { user: user!, roles };
    });
    const id = userId(user.id);

    const { replaced, cleared } = await run(
      Effect.gen(function* () {
        const repo = yield* users;
        yield* repo.setAccessRoles(id, [roleId(roles[1]!.id), roleId(roles[2]!.id)]);
        const replaced = yield* repo.accessRoleIds(id);
        yield* repo.setAccessRoles(id, []);
        return { replaced, cleared: yield* repo.accessRoleIds(id) };
      }),
    );

    expect([...replaced].sort()).toEqual([roles[1]!.id, roles[2]!.id].sort());
    expect(cleared).toEqual([]);
  });

  it('delete with revokeAllForUser in one transaction keeps revoked sessions with user_id NULL (AC-07)', async () => {
    const { user, other, mine } = await withDb(async (db) => {
      const [user, other] = await seedUsers(db, [makeUser(), makeUser()]);
      const [role] = await seedAccessRoles(db, [makeAccessRole({ permissionKeys: ['a:one'] })]);
      await seedUserAccessRoles(db, [{ userId: user!.id, accessRoleId: role!.id }]);
      const mine = await seedSessions(db, [
        makeSession({ userId: user!.id }),
        makeSession({ userId: user!.id }),
      ]);
      await seedSessions(db, [makeSession({ userId: other!.id })]);
      return { user: user!, other: other!, mine };
    });
    const id = userId(user.id);

    const [deleted, deletedAgain] = await run(
      Effect.gen(function* () {
        const userRepo = yield* users;
        const sessionRepo = yield* sessions;
        const uow = yield* UnitOfWork;
        const deleted = yield* uow.transactional(
          sessionRepo
            .revokeAllForUser(id, 'access-removed')
            .pipe(Effect.zipRight(userRepo.delete(id))),
        );
        return [deleted, yield* userRepo.delete(id)] as const;
      }),
    );

    expect([deleted, deletedAgain]).toEqual([true, false]);
    const rows = await storedSessions();
    const byHash = new Map(rows.map((row) => [row.tokenHash, row]));
    for (const session of mine) {
      expect(byHash.get(session.tokenHash)).toMatchObject({
        userId: null,
        revokedReason: 'access-removed',
      });
      const resolved = Option.getOrThrow(await resolve(session.tokenHash as SessionTokenHash));
      expect(resolved).toMatchObject({
        userId: null,
        revokedReason: 'access-removed',
        grantedKeys: [],
      });
    }
    expect(rows.filter((row) => row.userId === other.id)).toEqual([
      expect.objectContaining({ revokedReason: null }),
    ]);
    const assignments = await withDb(async (db) => {
      const { rows } = await db.execute<{ count: number }>(
        'SELECT count(*)::int AS count FROM identity.user_access_roles',
      );
      return rows[0]!.count;
    });
    expect(assignments).toBe(0);
  });

  it('a failed transaction rolls back both the revocation and the delete', async () => {
    const [user] = await withDb(async (db) => {
      const seeded = await seedUsers(db, [makeUser()]);
      await seedSessions(db, [makeSession({ userId: seeded[0]!.id })]);
      return seeded;
    });
    const id = userId(user!.id);

    const exit = await runExit(
      Effect.gen(function* () {
        const userRepo = yield* users;
        const sessionRepo = yield* sessions;
        const uow = yield* UnitOfWork;
        yield* uow.transactional(
          sessionRepo
            .revokeAllForUser(id, 'access-removed')
            .pipe(
              Effect.zipRight(userRepo.delete(id)),
              Effect.zipRight(Effect.fail('boom' as const)),
            ),
        );
      }),
    );

    expect(exit).toEqual(Exit.fail('boom'));
    expect(await storedSessions()).toEqual([
      expect.objectContaining({ userId: user!.id, revokedReason: null }),
    ]);
  });
});
