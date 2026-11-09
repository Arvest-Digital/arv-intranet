import { CreateUserInput, UserIdParam } from '@arv/contracts/identity';
import { UserId } from '@arv/kernel';
import { type HttpEnv, runEffect, validate } from '@arv/platform/http';
import { Effect, Option } from 'effect';
import { Hono } from 'hono';
import { UserRepository } from '../application/ports';
import { EmailTaken, UserNotFound } from '../domain/errors';
import { presentUser, toContractError } from './presenter';

// TODO(identity T18): the scaffold `/users` handlers below, kept inline only so the web's typed
// client keeps compiling. T18 replaces them with the guarded access-list use cases
// (`application/access-list/`) and the contract's `UserWithAccessRoles` shape.
const scaffoldListUsers = Effect.flatMap(UserRepository, (repo) => repo.list());

const scaffoldGetUser = (id: UserId) =>
  Effect.flatMap(UserRepository, (repo) => repo.findById(id)).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new UserNotFound({ id })),
        onSome: Effect.succeed,
      }),
    ),
  );

const scaffoldCreateUser = (input: { readonly email: string; readonly name: string }) =>
  Effect.gen(function* () {
    const repo = yield* UserRepository;
    if (Option.isSome(yield* repo.findByEmail(input.email))) {
      return yield* new EmailTaken({ email: input.email });
    }
    return yield* repo.create(input);
  });

/** Mounted at `/` by the host, so paths here are the public paths. */
export const identityRoutes = new Hono<HttpEnv>()
  .get('/users', (c) =>
    runEffect(c, scaffoldListUsers.pipe(Effect.map((list) => list.map(presentUser)))),
  )
  .get('/users/:id', validate('param', UserIdParam), (c) =>
    runEffect(
      c,
      scaffoldGetUser(UserId.make(c.req.valid('param').id)).pipe(
        Effect.map(presentUser),
        Effect.mapError(toContractError),
      ),
    ),
  )
  .post('/users', validate('json', CreateUserInput), (c) =>
    runEffect(
      c,
      scaffoldCreateUser(c.req.valid('json')).pipe(
        Effect.map(presentUser),
        Effect.mapError(toContractError),
      ),
      201,
    ),
  );

/** Route types for the identity client in apps/web (`hc<IdentityRoutes>`). */
export type IdentityRoutes = typeof identityRoutes;
