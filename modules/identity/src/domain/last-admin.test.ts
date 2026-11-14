import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { LastAdminRequired } from './errors';
import { assertAdminRemains, isFirstAdmin } from './last-admin';

describe('isFirstAdmin', () => {
  const firstAdmin = 'admin-1@example.test';

  it('applies to the configured address while no admin exists', () => {
    expect(isFirstAdmin('admin-1@example.test', firstAdmin, false)).toBe(true);
  });

  it('compares the address case-insensitively and trimmed', () => {
    expect(isFirstAdmin(' Admin-1@Example.test ', firstAdmin, false)).toBe(true);
  });

  it('does not apply once an admin exists', () => {
    expect(isFirstAdmin('admin-1@example.test', firstAdmin, true)).toBe(false);
  });

  it('does not apply to another address', () => {
    expect(isFirstAdmin('user-1@example.test', firstAdmin, false)).toBe(false);
  });

  it('never applies when no first admin is configured', () => {
    expect(isFirstAdmin('', '', false)).toBe(false);
    expect(isFirstAdmin('admin-1@example.test', '  ', false)).toBe(false);
  });
});

describe('assertAdminRemains', () => {
  it('fails with LastAdminRequired when no holder remains', () => {
    const exit = Effect.runSyncExit(assertAdminRemains(0));
    expect(exit).toStrictEqual(Exit.fail(new LastAdminRequired()));
  });

  it('allows one or more holders', () => {
    expect(Exit.isSuccess(Effect.runSyncExit(assertAdminRemains(1)))).toBe(true);
    expect(Exit.isSuccess(Effect.runSyncExit(assertAdminRemains(3)))).toBe(true);
  });
});
