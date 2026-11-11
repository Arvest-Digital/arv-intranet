import {
  PageQuery,
  UserAccessRolesChange,
  UserChange,
  UserCreate,
  UserIdPath,
} from '@arv/contracts/identity';
import { UserId } from '@arv/kernel';
import { type HttpEnv, runEffect, runEffectNoContent, validate } from '@arv/platform/http';
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import {
  addUser,
  getUser,
  listUsers,
  removeUser,
  renameUser,
  setUserAccessRoles,
} from '../application/access-list';
import { AccessRoleId } from '../application/ports';
import { UserName } from '../domain/user';
import { mapAccessListErrors, presentUserAccess, presentUserPage } from './presenter';

/** The contract's name is already trimmed and shorter than the domain's limit, so this never fails. */
const toUserName = (name: string) => Schema.decode(UserName)(name).pipe(Effect.orDie);

const toAccessRoleIds = (ids: ReadonlyArray<string>) => ids.map((id) => AccessRoleId.make(id));

/**
 * The access list (openapi.yaml `access-list` tag). Every route requires `identity:manage-access`,
 * checked first in each use case (AC-08).
 */
export const accessListRoutes = new Hono<HttpEnv>()
  .get('/users', validate('query', PageQuery), (c) =>
    runEffect(
      c,
      listUsers(c.req.valid('query')).pipe(Effect.map(presentUserPage), mapAccessListErrors),
    ),
  )
  .post('/users', validate('json', UserCreate), (c) => {
    const { email, name, accessRoleIds } = c.req.valid('json');
    return runEffect(
      c,
      toUserName(name).pipe(
        Effect.flatMap((userName) =>
          addUser({ email, name: userName, accessRoleIds: toAccessRoleIds(accessRoleIds) }),
        ),
        Effect.map(presentUserAccess),
        mapAccessListErrors,
      ),
      201,
    );
  })
  .get('/users/:userId', validate('param', UserIdPath), (c) =>
    runEffect(
      c,
      getUser(UserId.make(c.req.valid('param').userId)).pipe(
        Effect.map(presentUserAccess),
        mapAccessListErrors,
      ),
    ),
  )
  .patch('/users/:userId', validate('param', UserIdPath), validate('json', UserChange), (c) => {
    const id = UserId.make(c.req.valid('param').userId);
    return runEffect(
      c,
      toUserName(c.req.valid('json').name).pipe(
        Effect.flatMap((name) => renameUser(id, name)),
        Effect.map(presentUserAccess),
        mapAccessListErrors,
      ),
    );
  })
  .delete('/users/:userId', validate('param', UserIdPath), (c) =>
    runEffectNoContent(
      c,
      removeUser(UserId.make(c.req.valid('param').userId)).pipe(mapAccessListErrors),
    ),
  )
  .put(
    '/users/:userId/access-roles',
    validate('param', UserIdPath),
    validate('json', UserAccessRolesChange),
    (c) =>
      runEffect(
        c,
        setUserAccessRoles(
          UserId.make(c.req.valid('param').userId),
          toAccessRoleIds(c.req.valid('json').accessRoleIds),
        ).pipe(Effect.map(presentUserAccess), mapAccessListErrors),
      ),
  );
