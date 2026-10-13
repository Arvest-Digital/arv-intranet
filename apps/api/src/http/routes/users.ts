import { CreateUserInput, User, UserIdParam } from '@arv/contracts';
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { UserService } from '../../layers';
import { runEffect } from '../effect-handler';
import { validate } from '../validate';

const encodeUser = Schema.encodeSync(User);

export const usersRoutes = new Hono<AppEnv>()
  .get('/', (c) =>
    runEffect(
      c,
      Effect.flatMap(UserService, (users) => users.list()).pipe(
        Effect.map((list) => list.map((user) => encodeUser(user))),
      ),
    ),
  )
  .get('/:id', validate('param', UserIdParam), (c) =>
    runEffect(
      c,
      Effect.flatMap(UserService, (users) => users.get(c.req.valid('param').id)).pipe(
        Effect.map(encodeUser),
      ),
    ),
  )
  .post('/', validate('json', CreateUserInput), (c) =>
    runEffect(
      c,
      Effect.flatMap(UserService, (users) => users.create(c.req.valid('json'))).pipe(
        Effect.map(encodeUser),
      ),
      201,
    ),
  );
