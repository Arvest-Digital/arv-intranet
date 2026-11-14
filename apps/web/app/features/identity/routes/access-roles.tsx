import { PlusIcon } from 'lucide-react';
import { data, Link } from 'react-router';
import type { ApiFailure } from '~/shared/lib/api.server';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { buttonVariants } from '~/shared/ui/button';
import type { AccessListActionResult } from '../components/access-list-form';
import { RoleIntent } from '../components/access-role-form';
import { AccessRoleList } from '../components/access-role-list';
import { AccessHeader } from '../components/access-tabs';
import { formFailure } from '../form-failure';
import { refusalResponse } from '../gate.server';
import { identityGateway } from '../identity.server';
import type { Route } from './+types/access-roles';

export const meta: Route.MetaFunction = () => [{ title: 'Roles · Access · ARV Intranet' }];

/** 403 → «you lack the permission to manage access», showing none of the roles (AC-08). */
async function loadFailure(failed: ApiFailure, request: Request) {
  return (
    (await refusalResponse(failed, request)) ??
    data('Could not load the access roles', { status: 502 })
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gateway = identityGateway(context.cloudflare.env.API, await getSessionToken(request));
  const roles = await gateway.listAccessRoles();
  if (!roles.ok) throw await loadFailure(roles, request);
  return { roles: roles.value };
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/**
 * Deleting and the pre-selected mark, told apart by `intent`; refusals come back inline (AC-11,
 * AC-13, AC-14). Creating and editing post to the role page.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const gateway = identityGateway(context.cloudflare.env.API, await getSessionToken(request));
  const roleId = text(form, 'accessRoleId');

  const result = await (() => {
    switch (form.get('intent') as RoleIntent | null) {
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
    { ok: false, ...formFailure(result) },
    { status: result.status },
  );
}

export default function AccessRoles({ loaderData }: Route.ComponentProps) {
  const { roles } = loaderData;
  return (
    <main className="flex flex-col gap-6">
      <AccessHeader
        action={
          <Link to="/access/roles/new" className={buttonVariants()}>
            <PlusIcon aria-hidden="true" />
            New role
          </Link>
        }
      />
      <AccessRoleList roles={roles} />
    </main>
  );
}
