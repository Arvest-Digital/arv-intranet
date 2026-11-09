import { UserId } from '@arv/kernel';
import { Effect, Either, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { createUser } from './create-user';
import { getUser } from './get-user';
import { listUsers } from './list-users';
import { UserRepository } from './ports';
import { makeIdentityFakes } from './testing';

const setup = () => {
  const fakes = makeIdentityFakes();
  const ann = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' });
  return { fakes, ann };
};

/** The fakes' UserRepository with single methods overridden. */
const withUsers = (
  fakes: ReturnType<typeof makeIdentityFakes>,
  overrides: Partial<UserRepository['Type']> = {},
) => Layer.succeed(UserRepository, { ...fakes.users, ...overrides });

const run = <A, E>(
  effect: Effect.Effect<A, E, UserRepository>,
  repo: Layer.Layer<UserRepository>,
) => Effect.runPromise(Effect.either(effect.pipe(Effect.provide(repo))));

describe('listUsers', () => {
  it('returns the users from the repository', async () => {
    const { fakes, ann } = setup();
    expect(await run(listUsers(), withUsers(fakes))).toEqual(Either.right([ann]));
  });
});

describe('getUser', () => {
  it('returns the user', async () => {
    const { fakes, ann } = setup();
    expect(await run(getUser(ann.id), withUsers(fakes))).toEqual(Either.right(ann));
  });

  it('fails with UserNotFound for an unknown id', async () => {
    const { fakes } = setup();
    const result = await run(
      getUser(UserId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd')),
      withUsers(fakes),
    );
    expect(Either.isLeft(result) && result.left._tag).toBe('UserNotFound');
  });
});

describe('createUser', () => {
  it('creates a user when the email is free', async () => {
    const { fakes } = setup();
    const result = await run(
      createUser({ email: 'bob@arvest.digital', name: 'Bob' }),
      withUsers(fakes),
    );
    expect(Either.getOrThrow(result)).toMatchObject({ email: 'bob@arvest.digital', name: 'Bob' });
  });

  it('fails with EmailTaken when the email is taken', async () => {
    const { fakes, ann } = setup();
    const result = await run(createUser({ email: ann.email, name: 'Ann 2' }), withUsers(fakes));
    expect(Either.isLeft(result) && result.left._tag).toBe('EmailTaken');
  });

  it('does not create when the email is taken', async () => {
    const { fakes, ann } = setup();
    let created = false;
    const repo = withUsers(fakes, {
      create: () => {
        created = true;
        return Effect.die('unreachable');
      },
    });
    await run(createUser({ email: ann.email, name: 'Ann 2' }), repo);
    expect(created).toBe(false);
  });
});
