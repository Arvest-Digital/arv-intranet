import type { User } from '@arv/contracts';
import { DbError } from '@arv/db';
import { Effect, Either, Layer, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { UserRepo } from '../repositories/user-repo';
import { UserService, UserServiceLive } from './user-service';

const ann: User = {
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
  email: 'ann@arvest.digital',
  name: 'Ann',
  createdAt: new Date('2026-10-13T10:00:00Z'),
};

/** In-memory UserRepo; override single methods per test. */
const makeRepo = (overrides: Partial<UserRepo['Type']> = {}) =>
  Layer.succeed(UserRepo, {
    list: () => Effect.succeed([ann]),
    findById: (id) => Effect.succeed(Option.fromNullable(id === ann.id ? ann : undefined)),
    findByEmail: (email) =>
      Effect.succeed(Option.fromNullable(email === ann.email ? ann : undefined)),
    create: (input) => Effect.succeed({ ...input, id: crypto.randomUUID(), createdAt: new Date() }),
    ...overrides,
  });

const run = <A, E>(
  effect: Effect.Effect<A, E, UserService>,
  repo: Layer.Layer<UserRepo> = makeRepo(),
) =>
  Effect.runPromise(
    Effect.either(effect.pipe(Effect.provide(UserServiceLive), Effect.provide(repo))),
  );

describe('UserService.get', () => {
  it('returns the user', async () => {
    const result = await run(Effect.flatMap(UserService, (s) => s.get(ann.id)));
    expect(result).toEqual(Either.right(ann));
  });

  it('fails with NotFound for an unknown id', async () => {
    const result = await run(Effect.flatMap(UserService, (s) => s.get('missing')));
    expect(Either.isLeft(result) && result.left._tag).toBe('NotFound');
  });
});

describe('UserService.create', () => {
  it('creates a user when the email is free', async () => {
    const result = await run(
      Effect.flatMap(UserService, (s) => s.create({ email: 'bob@arvest.digital', name: 'Bob' })),
    );
    expect(Either.getOrThrow(result)).toMatchObject({ email: 'bob@arvest.digital', name: 'Bob' });
  });

  it('fails with Conflict when the email is taken', async () => {
    const result = await run(
      Effect.flatMap(UserService, (s) => s.create({ email: ann.email, name: 'Ann 2' })),
    );
    expect(Either.isLeft(result) && result.left._tag).toBe('Conflict');
  });

  it('propagates DbError from the repo', async () => {
    const failing = makeRepo({ list: () => Effect.fail(new DbError({ cause: 'boom' })) });
    const result = await run(
      Effect.flatMap(UserService, (s) => s.list()),
      failing,
    );
    expect(Either.isLeft(result) && result.left._tag).toBe('DbError');
  });
});
