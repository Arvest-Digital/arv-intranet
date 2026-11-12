import { data, Link } from 'react-router';
import type { ApiFailure } from '~/shared/lib/api.server';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { buttonVariants } from '~/shared/ui/button';
import { type AccessListActionResult, Intent } from '../components/access-list-form';
import { AddUserDialog } from '../components/add-user-dialog';
import { UserList } from '../components/user-list';
import { refusalResponse } from '../gate.server';
import { identityGateway, type UserPageCursor } from '../identity.server';
import type { Route } from './+types/access-users';

export const meta: Route.MetaFunction = () => [{ title: 'Access list · ARV Intranet' }];

/** `?after=<id>` or `?before=<id>`: the page of the access list to show. */
function cursorOf(url: URL): UserPageCursor {
  const after = url.searchParams.get('after');
  if (after) return { after };
  const before = url.searchParams.get('before');
  return before ? { before } : {};
}

/** 403 → «you lack the permission to manage access», showing nothing of the list (AC-08). */
async function loadFailure(failed: ApiFailure, request: Request) {
  return (
    (await refusalResponse(failed, request)) ??
    data('Could not load the access list', { status: 502 })
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gateway = identityGateway(context.cloudflare.env.API, await getSessionToken(request));
  const [users, roles] = await Promise.all([
    gateway.listUsers(cursorOf(new URL(request.url))),
    gateway.listAccessRoles(),
  ]);
  if (!users.ok) throw await loadFailure(users, request);
  if (!roles.ok) throw await loadFailure(roles, request);
  return { page: users.value, roles: roles.value };
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const roleIds = (form: FormData) => form.getAll('accessRoleId').map(String);

/** One action for every dialog, told apart by `intent`; refusals come back inline (AC-05, AC-06, AC-14). */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const gateway = identityGateway(context.cloudflare.env.API, await getSessionToken(request));
  const userId = text(form, 'userId');

  const result = await (() => {
    switch (form.get('intent') as Intent | null) {
      case Intent.add:
        return gateway.createUser({
          email: text(form, 'email'),
          name: text(form, 'name'),
          accessRoleIds: roleIds(form),
        });
      case Intent.rename:
        return gateway.renameUser(userId, text(form, 'name'));
      case Intent.remove:
        return gateway.removeUser(userId);
      case Intent.setRoles:
        return gateway.setUserAccessRoles(userId, roleIds(form));
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

const pageLink = buttonVariants({ variant: 'outline', size: 'sm' });

export default function AccessUsers({ loaderData }: Route.ComponentProps) {
  const { page, roles } = loaderData;
  const first = page.items[0];
  return (
    <main>
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Access list</h1>
        <div className="ml-auto">
          <AddUserDialog roles={roles} />
        </div>
      </div>
      <UserList users={page.items} roles={roles} />
      {page.hasPrev || page.hasNext ? (
        <nav aria-label="Pages" className="mt-4 flex justify-end gap-2">
          {page.hasPrev && first ? (
            <Link to={`?before=${first.id}`} className={pageLink}>
              Previous
            </Link>
          ) : null}
          {page.hasNext && page.nextCursor ? (
            <Link to={`?after=${page.nextCursor}`} className={pageLink}>
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
