import { data } from 'react-router';
import type { ApiFailure } from '~/shared/lib/api.server';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { getSessionToken } from '~/shared/lib/session.server';
import type { AccessListActionResult } from '../components/access-list-form';
import { NewAccessRoleDialog, RoleIntent } from '../components/access-role-form';
import { AccessRoleList } from '../components/access-role-list';
import { AccessTabs } from '../components/access-tabs';
import { refusalResponse } from '../gate.server';
import { identityGateway } from '../identity.server';
import type { Route } from './+types/access-roles';

export const meta: Route.MetaFunction = () => [{ title: 'Access roles · ARV Intranet' }];

/** 403 → «you lack the permission to manage access», showing none of the roles (AC-08). */
async function loadFailure(failed: ApiFailure, request: Request) {
  return (
    (await refusalResponse(failed, request)) ??
    data('Could not load the access roles', { status: 502 })
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gateway = identityGateway(context.cloudflare.env.API, await getSessionToken(request));
  const [roles, catalog] = await Promise.all([
    gateway.listAccessRoles(),
    gateway.listPermissions(),
  ]);
  if (!roles.ok) throw await loadFailure(roles, request);
  if (!catalog.ok) throw await loadFailure(catalog, request);
  return { roles: roles.value, catalog: catalog.value };
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const roleInput = (form: FormData) => ({
  name: text(form, 'name'),
  permissionKeys: [...new Set(form.getAll('permissionKey').map(String))],
});

/** One action for every dialog, told apart by `intent`; refusals come back inline (AC-10, AC-14, AC-16). */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const gateway = identityGateway(context.cloudflare.env.API, await getSessionToken(request));
  const roleId = text(form, 'accessRoleId');

  const result = await (() => {
    switch (form.get('intent') as RoleIntent | null) {
      case RoleIntent.create:
        return gateway.createAccessRole(roleInput(form));
      case RoleIntent.update:
        return gateway.updateAccessRole(roleId, roleInput(form));
      case RoleIntent.remove:
        return gateway.deleteAccessRole(roleId);
      case RoleIntent.preselect:
        // An empty id clears the mark (AC-13).
        return gateway.setPreselectedAccessRole(roleId || null);
      default:
        return null;
    }
  })();

  if (result === null) {
    return data<AccessListActionResult>({ ok: false, error: 'Unknown action' }, { status: 400 });
  }
  if (result.ok) return { ok: true } satisfies AccessListActionResult;
  const refused = await refusalResponse(result, request);
  if (refused) throw refused;
  return data<AccessListActionResult>(
    { ok: false, error: result.message },
    { status: result.status },
  );
}

export default function AccessRoles({ loaderData }: Route.ComponentProps) {
  const { roles, catalog } = loaderData;
  return (
    <main>
      <AccessTabs />
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Access roles</h1>
        <div className="ml-auto">
          <NewAccessRoleDialog catalog={catalog} />
        </div>
      </div>
      <AccessRoleList roles={roles} catalog={catalog} />
    </main>
  );
}
