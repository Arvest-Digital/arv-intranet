import { CreateUserInput, UserIdParam } from '@arv/contracts/identity';
import { UserId } from '@arv/kernel';
import { type HttpEnv, runEffect, validate } from '@arv/platform/http';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { createUser } from '../application/create-user';
import { getUser } from '../application/get-user';
import { listUsers } from '../application/list-users';
import { presentUser, toContractError } from './presenter';

/** Mounted at `/` by the host, so paths here are the public paths. */
export const identityRoutes = new Hono<HttpEnv>()
  .get('/users', (c) => runEffect(c, listUsers().pipe(Effect.map((list) => list.map(presentUser)))))
  .get('/users/:id', validate('param', UserIdParam), (c) =>
    runEffect(
      c,
      getUser(UserId.make(c.req.valid('param').id)).pipe(
        Effect.map(presentUser),
        Effect.mapError(toContractError),
      ),
    ),
  )
  .post('/users', validate('json', CreateUserInput), (c) =>
    runEffect(
      c,
      createUser(c.req.valid('json')).pipe(
        Effect.map(presentUser),
        Effect.mapError(toContractError),
      ),
      201,
    ),
  );

/** Route types for the identity client in apps/web (`hc<IdentityRoutes>`). */
export type IdentityRoutes = typeof identityRoutes;
