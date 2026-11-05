import { Effect, Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, CurrentActor } from './actor';
import type { UserId } from './ids';
import { Permission, PermissionDenied, requirePermission, Unauthenticated } from './permission';

const userId = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b' as UserId;
const key = (s: string) => Schema.decodeUnknownSync(Permission)(s);

const manageAccess = key('identity:manage-access');
const editAllocations = key('scheduling:edit-allocations');

const check = (actor: Actor, permission: Permission) =>
  requirePermission(permission).pipe(
    Effect.provideService(CurrentActor, actor),
    Effect.either,
    Effect.runSync,
  );

const user = (...permissions: Permission[]) =>
  Actor.User({ id: userId, permissions: new Set(permissions) });

describe('Permission', () => {
  it('accepts <module>:<kebab-action> keys', () => {
    expect(Schema.is(Permission)('identity:manage-access')).toBe(true);
  });

  it.each(['manage-access', 'Identity:manage', 'identity:Manage', 'identity:', 'a:b:c'])(
    'rejects %s',
    (s) => {
      expect(Schema.is(Permission)(s)).toBe(false);
    },
  );
});

describe('requirePermission', () => {
  it('refuses an anonymous actor with Unauthenticated', () => {
    const result = check(Actor.Anonymous(), manageAccess);
    expect(Either.isLeft(result) && result.left).toBeInstanceOf(Unauthenticated);
  });

  it('refuses a user without the key with PermissionDenied naming it', () => {
    const result = check(user(), manageAccess);
    expect(Either.isLeft(result) && result.left).toEqual(
      new PermissionDenied({ permission: manageAccess }),
    );
  });

  it('lets a user holding the key through', () => {
    expect(Either.isRight(check(user(manageAccess), manageAccess))).toBe(true);
  });

  it('denies a user holding only identity:manage-access scheduling:edit-allocations (AC-19)', () => {
    const result = check(user(manageAccess), editAllocations);
    expect(Either.isLeft(result) && result.left).toEqual(
      new PermissionDenied({ permission: editAllocations }),
    );
  });

  it('refuses a key nobody holds for every actor, an admin included (AC-18)', () => {
    const unheld = key('billing:approve-invoices');
    const admin = user(manageAccess, editAllocations);

    expect(Either.isLeft(check(Actor.Anonymous(), unheld))).toBe(true);
    expect(check(user(), unheld)).toEqual(
      Either.left(new PermissionDenied({ permission: unheld })),
    );
    expect(check(admin, unheld)).toEqual(Either.left(new PermissionDenied({ permission: unheld })));
  });
});
