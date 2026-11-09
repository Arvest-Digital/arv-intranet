import { Actor } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { hashSessionToken } from '../domain/session';
import { MANAGE_ACCESS } from '../permissions';
import { resolveActor } from './resolve-actor';
import { signOut } from './sign-out';
import { makeIdentityFakes } from './testing';

const hash = (token: string) => Effect.runPromise(hashSessionToken(token));

describe('signOut', () => {
  it('removes that one session and leaves the user’s other session valid (AC-20)', async () => {
    const fakes = makeIdentityFakes();
    const admin = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
    const user = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [admin.id]);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    fakes.seedSession({ tokenHash: await hash('laptop'), userId: user.id, expiresAt });
    fakes.seedSession({ tokenHash: await hash('phone'), userId: user.id, expiresAt });

    await Effect.runPromise(signOut('laptop').pipe(Effect.provide(fakes.layer)));

    expect(fakes.snapshot().sessions.map((s) => s.tokenHash)).toEqual([await hash('phone')]);
    const resolve = (token: string) =>
      Effect.runPromise(resolveActor(Option.some(token)).pipe(Effect.provide(fakes.layer)));
    expect(await resolve('laptop')).toEqual(Actor.Anonymous());
    expect(await resolve('phone')).toEqual(
      Actor.User({ id: user.id, permissions: new Set([MANAGE_ACCESS]) }),
    );
  });

  it('treats an unknown token as already signed out', async () => {
    const fakes = makeIdentityFakes();
    await expect(
      Effect.runPromise(signOut('unknown').pipe(Effect.provide(fakes.layer))),
    ).resolves.toBeUndefined();
  });
});
