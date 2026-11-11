import {
  AccessRoleIdPath,
  AccessRoleInput,
  PageQuery,
  PreselectedAccessRole,
} from '@arv/contracts/identity';
import { type HttpEnv, runEffect, runEffectNoContent, validate } from '@arv/platform/http';
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import {
  createAccessRole,
  deleteAccessRole,
  getAccessRole,
  listAccessRoles,
  setPreselectedAccessRole,
  updateAccessRole,
} from '../application/access-roles';
import { listPermissions } from '../application/list-permissions';
import { pageById } from '../application/page';
import { AccessRoleId } from '../application/ports';
import { AccessRoleName } from '../domain/access-role';
import {
  mapAccessRoleErrors,
  presentAccessRole,
  presentAccessRolePage,
  presentPermissionCatalog,
  presentPreselectedAccessRole,
} from './presenter';

/** The contract's name is already trimmed and within the domain's limit, so this never fails. */
const toInput = ({ name, permissionKeys }: AccessRoleInput) =>
  Schema.decode(AccessRoleName)(name).pipe(
    Effect.orDie,
    Effect.map((roleName) => ({ name: roleName, permissionKeys })),
  );

const roleIdOf = (param: { readonly accessRoleId: string }) =>
  AccessRoleId.make(param.accessRoleId);

/**
 * Access roles, the pre-selected mark and the permission catalog (openapi.yaml `access-roles`
 * tag). Every route requires `identity:manage-access`, checked first in each use case.
 */
export const accessRoleRoutes = new Hono<HttpEnv>()
  .get('/identity/access-roles', validate('query', PageQuery), (c) =>
    runEffect(
      c,
      // A handful of roles: every one is described, then the page is cut.
      listAccessRoles().pipe(
        Effect.map((roles) => presentAccessRolePage(pageById(roles, c.req.valid('query')))),
        mapAccessRoleErrors,
      ),
    ),
  )
  .post('/identity/access-roles', validate('json', AccessRoleInput), (c) =>
    runEffect(
      c,
      toInput(c.req.valid('json')).pipe(
        Effect.flatMap(createAccessRole),
        Effect.map(presentAccessRole),
        mapAccessRoleErrors,
      ),
      201,
    ),
  )
  .get('/identity/access-roles/:accessRoleId', validate('param', AccessRoleIdPath), (c) =>
    runEffect(
      c,
      getAccessRole(roleIdOf(c.req.valid('param'))).pipe(
        Effect.map(presentAccessRole),
        mapAccessRoleErrors,
      ),
    ),
  )
  .put(
    '/identity/access-roles/:accessRoleId',
    validate('param', AccessRoleIdPath),
    validate('json', AccessRoleInput),
    (c) => {
      const id = roleIdOf(c.req.valid('param'));
      return runEffect(
        c,
        toInput(c.req.valid('json')).pipe(
          Effect.flatMap((input) => updateAccessRole(id, input)),
          Effect.map(presentAccessRole),
          mapAccessRoleErrors,
        ),
      );
    },
  )
  .delete('/identity/access-roles/:accessRoleId', validate('param', AccessRoleIdPath), (c) =>
    runEffectNoContent(
      c,
      deleteAccessRole(roleIdOf(c.req.valid('param'))).pipe(mapAccessRoleErrors),
    ),
  )
  .put('/identity/preselected-access-role', validate('json', PreselectedAccessRole), (c) => {
    const { accessRoleId } = c.req.valid('json');
    return runEffect(
      c,
      setPreselectedAccessRole(accessRoleId === null ? null : AccessRoleId.make(accessRoleId)).pipe(
        Effect.map(presentPreselectedAccessRole),
        mapAccessRoleErrors,
      ),
    );
  })
  .get('/identity/permissions', (c) =>
    runEffect(c, listPermissions().pipe(Effect.map(presentPermissionCatalog))),
  );
