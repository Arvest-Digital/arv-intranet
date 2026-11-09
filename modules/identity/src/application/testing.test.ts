import { Permission, UnitOfWork } from '@arv/kernel';
import { Effect, Either, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccessRoleName } from '../domain/access-role';
import type { SessionTokenHash } from '../domain/session';
import { MANAGE_ACCESS } from '../permissions';
import {
  AccessRoleRepository,
  GoogleSignIn,
  PermissionCatalog,
  SessionRepository,
  UserRepository,
} from './ports';
import { makeIdentityFakes } from './testing';

const hash = (value: string) => value as SessionTokenHash;
const future = new Date('2100-01-01T00:00:00Z');

describe('fake PermissionCatalog', () => {
  it('reports a key as undeclared once it is removed (AC-16, AC-18)', () => {
    const fakes = makeIdentityFakes();
    const isDeclared = (key: string) =>
      Effect.runSync(
        Effect.map(PermissionCatalog, (c) => c.isDeclared(key)).pipe(Effect.provide(fakes.layer)),
      );
    expect(isDeclared(MANAGE_ACCESS)).toBe(true);

    fakes.retire(MANAGE_ACCESS);
    expect(isDeclared(MANAGE_ACCESS)).toBe(false);
    expect(fakes.catalog.declarations()).toEqual([]);
  });

  it('declares again under the same key', () => {
    const fakes = makeIdentityFakes({ declarations: [] });
    expect(fakes.catalog.isDeclared('scheduling:edit-allocations')).toBe(false);
    fakes.declare({
      key: Permission.make('scheduling:edit-allocations'),
      name: 'Edit allocations',
      description: 'Change who works on what.',
      feature: 'Scheduling',
    });
    expect(fakes.catalog.isDeclared('scheduling:edit-allocations')).toBe(true);
  });
});

describe('fake repositories', () => {
  it('resolve returns the union of keys over the user’s roles and sees role changes', () => {
    const fakes = makeIdentityFakes();
    const admin = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
    const planner = fakes.seedRole({ name: 'Planner', permissionKeys: ['scheduling:plan'] });
    const ann = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [
      admin.id,
      planner.id,
    ]);
    fakes.seedSession({ tokenHash: hash('h1'), userId: ann.id, expiresAt: future });

    const resolve = () =>
      Effect.runSync(
        Effect.flatMap(SessionRepository, (s) => s.resolve(hash('h1'))).pipe(
          Effect.provide(fakes.layer),
        ),
      );
    expect(Option.getOrThrow(resolve()).grantedKeys).toEqual([MANAGE_ACCESS, 'scheduling:plan']);

    Effect.runSync(
      Effect.flatMap(UserRepository, (u) => u.setAccessRoles(ann.id, [planner.id])).pipe(
        Effect.provide(fakes.layer),
      ),
    );
    expect(Option.getOrThrow(resolve()).grantedKeys).toEqual(['scheduling:plan']);
  });

  it('deleting a user keeps their revoked sessions with no user (AC-07)', () => {
    const fakes = makeIdentityFakes();
    const ann = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' });
    fakes.seedSession({ tokenHash: hash('h1'), userId: ann.id, expiresAt: future });
    Effect.runSync(
      Effect.gen(function* () {
        yield* (yield* SessionRepository).revokeAllForUser(ann.id, 'access-removed');
        yield* (yield* UserRepository).delete(ann.id);
      }).pipe(Effect.provide(fakes.layer)),
    );
    expect(fakes.snapshot().sessions).toEqual([
      { tokenHash: 'h1', userId: null, expiresAt: future, revokedReason: 'access-removed' },
    ]);
  });

  it('refuses a duplicate email and a duplicate role name key', async () => {
    const fakes = makeIdentityFakes();
    fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' });
    fakes.seedRole({ name: 'Planner' });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const email = yield* Effect.either(
          (yield* UserRepository).create({ email: 'ann@arvest.digital', name: 'Ann 2' }),
        );
        const role = yield* Effect.either(
          (yield* AccessRoleRepository).create({
            name: Schema.decodeSync(AccessRoleName)(' planner '),
            permissionKeys: [],
          }),
        );
        return [
          Either.flip(email).pipe(Either.map((e) => e._tag)),
          Either.flip(role).pipe(Either.map((e) => e._tag)),
        ];
      }).pipe(Effect.provide(fakes.layer)),
    );
    expect(result).toEqual([Either.right('EmailTaken'), Either.right('AccessRoleNameTaken')]);
  });

  it('ensureAdminRole reuses an existing «admin» role and adds manage access (AC-15)', () => {
    const fakes = makeIdentityFakes();
    const existing = fakes.seedRole({ name: ' admin ', permissionKeys: ['scheduling:plan'] });
    const role = Effect.runSync(
      Effect.flatMap(AccessRoleRepository, (r) => r.ensureAdminRole()).pipe(
        Effect.provide(fakes.layer),
      ),
    );
    expect(role.id).toBe(existing.id);
    expect(role.permissionKeys).toEqual(['scheduling:plan', MANAGE_ACCESS]);
  });

  it('setPreselected keeps at most one role marked (AC-13)', () => {
    const fakes = makeIdentityFakes();
    fakes.seedRole({ name: 'A', isPreselected: true });
    const b = fakes.seedRole({ name: 'B' });
    Effect.runSync(
      Effect.flatMap(AccessRoleRepository, (r) => r.setPreselected(b.id)).pipe(
        Effect.provide(fakes.layer),
      ),
    );
    expect(
      fakes
        .snapshot()
        .roles.filter((r) => r.isPreselected)
        .map((r) => r.id),
    ).toEqual([b.id]);
  });
});

describe('fake UnitOfWork', () => {
  it('rolls every change back when the unit fails', async () => {
    const fakes = makeIdentityFakes();
    const admin = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
    const ann = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [admin.id]);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const uow = yield* UnitOfWork;
        return yield* Effect.either(
          uow.transactional(
            Effect.gen(function* () {
              yield* (yield* UserRepository).delete(ann.id);
              const holders = yield* (yield* AccessRoleRepository).countManageAccessHolders();
              expect(holders).toBe(0);
              return yield* Effect.fail('LastAdminRequired' as const);
            }),
          ),
        );
      }).pipe(Effect.provide(fakes.layer)),
    );

    expect(result).toEqual(Either.left('LastAdminRequired'));
    expect(fakes.snapshot().users.map((u) => u.id)).toEqual([ann.id]);
    expect(fakes.snapshot().userRoles(ann.id)).toEqual([admin.id]);
  });

  it('commits when the unit succeeds', async () => {
    const fakes = makeIdentityFakes();
    const ann = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' });
    await Effect.runPromise(
      Effect.flatMap(UnitOfWork, (uow) =>
        uow.transactional(Effect.flatMap(UserRepository, (u) => u.delete(ann.id))),
      ).pipe(Effect.provide(fakes.layer)),
    );
    expect(fakes.snapshot().users).toEqual([]);
  });
});

describe('fake GoogleSignIn', () => {
  it('returns registered claims, refuses any other code, and records the exchange', async () => {
    const fakes = makeIdentityFakes();
    fakes.googleReturns('good', { email: 'ann@arvest.digital', email_verified: true });
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const google = yield* GoogleSignIn;
        return [
          yield* Effect.either(google.exchangeCode('good', 'v1')),
          yield* Effect.either(google.exchangeCode('bad', 'v2')),
        ];
      }).pipe(Effect.provide(fakes.layer)),
    );
    expect(Either.getOrThrow(results[0]!)).toMatchObject({ email: 'ann@arvest.digital' });
    expect(Either.isLeft(results[1]!) && results[1].left._tag).toBe('SignInRefused');
    expect(fakes.googleExchanges().map((e) => e.inTransaction)).toEqual([false, false]);
  });
});
