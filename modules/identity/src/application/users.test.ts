import { UserId } from '@arv/kernel';
import { Effect, Either, Layer, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { User } from '../domain/user';
import { createUser } from './create-user';
import { getUser } from './get-user';
import { listUsers } from './list-users';
import { UserRepository } from './ports';

const ann = new User({
  id: UserId.make('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91'),
  email: 'ann@arvest.digital',
  name: 'Ann',
  createdAt: new Date('2026-10-13T10:00:00Z'),
});

/** In-memory UserRepository; override single methods per test. */
const makeRepo = (overrides: Partial<UserRepository['Type']> = {}) =>
  Layer.succeed(UserRepository, {
    list: () => Effect.succeed([ann]),
    findById: (id) => Effect.succeed(Option.fromNullable(id === ann.id ? ann : undefined)),
    findByEmail: (email) =>
      Effect.succeed(Option.fromNullable(email === ann.email ? ann : undefined)),
    create: (input) =>
      Effect.succeed(
        new User({ ...input, id: UserId.make(crypto.randomUUID()), createdAt: new Date() }),
      ),
    ...overrides,
  });

const run = <A, E>(
  effect: Effect.Effect<A, E, UserRepository>,
  repo: Layer.Layer<UserRepository> = makeRepo(),
) => Effect.runPromise(Effect.either(effect.pipe(Effect.provide(repo))));

describe('listUsers', () => {
  it('returns the users from the repository', async () => {
    expect(await run(listUsers())).toEqual(Either.right([ann]));
  });
});

describe('getUser', () => {
  it('returns the user', async () => {
    expect(await run(getUser(ann.id))).toEqual(Either.right(ann));
  });

  it('fails with UserNotFound for an unknown id', async () => {
    const result = await run(getUser(UserId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd')));
    expect(Either.isLeft(result) && result.left._tag).toBe('UserNotFound');
  });
});

describe('createUser', () => {
  it('creates a user when the email is free', async () => {
    const result = await run(createUser({ email: 'bob@arvest.digital', name: 'Bob' }));
    expect(Either.getOrThrow(result)).toMatchObject({ email: 'bob@arvest.digital', name: 'Bob' });
  });

  it('fails with EmailTaken when the email is taken', async () => {
    const result = await run(createUser({ email: ann.email, name: 'Ann 2' }));
    expect(Either.isLeft(result) && result.left._tag).toBe('EmailTaken');
  });

  it('does not create when the email is taken', async () => {
    let created = false;
    const repo = makeRepo({
      create: () => {
        created = true;
        return Effect.die('unreachable');
      },
    });
    await run(createUser({ email: ann.email, name: 'Ann 2' }), repo);
    expect(created).toBe(false);
  });
});
