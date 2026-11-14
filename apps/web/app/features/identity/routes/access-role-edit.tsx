import { data, redirect } from 'react-router';
import type { ApiFailure } from '~/shared/lib/api.server';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { getSessionToken } from '~/shared/lib/session.server';
import type { AccessListActionResult } from '../components/access-list-form';
import { AccessRoleForm, RoleIntent } from '../components/access-role-form';
import { formFailure } from '../form-failure';
import { refusalResponse } from '../gate.server';
import { identityGateway } from '../identity.server';
import type { Route } from './+types/access-role-edit';

export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.role ? `Edit ${data.role.name}` : 'New role'} · Access · ARV Intranet` },
];

/** 403 → «you lack the permission to manage access», showing nothing of the role (AC-08). */
async function loadFailure(failed: ApiFailure, request: Request) {
  return (
    (await refusalResponse(failed, request)) ??
    data('Could not load the access role', { status: 502 })
  );
}

/** `/access/roles/new` has no `accessRoleId`; any other id must name an existing role. */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const gateway = identityGateway(context.cloudflare.env.API, await getSessionToken(request));
  const [roles, catalog] = await Promise.all([
    gateway.listAccessRoles(),
    gateway.listPermissions(),
  ]);
  if (!roles.ok) throw await loadFailure(roles, request);
  if (!catalog.ok) throw await loadFailure(catalog, request);
  const id = params.accessRoleId;
  const role = id ? roles.value.find((candidate) => candidate.id === id) : undefined;
  if (id && !role) throw data('Not Found', { status: 404 });
  return { role, catalog: catalog.value };
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/**
 * Saves the role, then its pre-selected mark if the box changed (AC-13), and goes back to the
 * roles. A refusal stays on the page: a taken name under the name (AC-10), anything else above
 * the buttons (AC-14, AC-16).
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const gateway = identityGateway(context.cloudflare.env.API, await getSessionToken(request));
  const input = {
    name: text(form, 'name'),
    permissionKeys: [...new Set(form.getAll('permissionKey').map(String))],
  };
  const accessRoleId = text(form, 'accessRoleId');

  const saved =
    form.get('intent') === RoleIntent.update && accessRoleId
      ? await gateway.updateAccessRole(accessRoleId, input)
      : await gateway.createAccessRole(input);

  const refuse = async (failed: ApiFailure) => {
    const refused = await refusalResponse(failed, request);
    if (refused) throw refused;
    return data<AccessListActionResult>(
      { ok: false, ...formFailure(failed) },
      { status: failed.status },
    );
  };
  if (!saved.ok) return refuse(saved);

  const wantPreselected = form.get('preselected') === 'on';
  if (wantPreselected !== saved.value.isPreselected) {
    // Ticking marks this role (and unmarks any other); unticking leaves none pre-selected.
    const marked = await gateway.setPreselectedAccessRole(wantPreselected ? saved.value.id : null);
    if (!marked.ok) return refuse(marked);
  }
  return redirect('/access/roles');
}

export default function AccessRoleEdit({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <AccessRoleForm
      // A fresh form per role, so moving between roles never keeps the last one's ticks.
      key={loaderData.role?.id ?? 'new'}
      role={loaderData.role}
      catalog={loaderData.catalog}
      result={actionData}
    />
  );
}
