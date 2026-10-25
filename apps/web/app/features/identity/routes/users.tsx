import { data, Form, useNavigation } from 'react-router';
import { Button } from '~/shared/ui/button';
import { UserList } from '../components/user-list';
import { identityGateway } from '../identity.server';
import type { Route } from './+types/users';

export const meta: Route.MetaFunction = () => [{ title: 'Users · ARV Intranet' }];

export async function loader({ context }: Route.LoaderArgs) {
  const result = await identityGateway(context.cloudflare.env.API).listUsers();
  if (!result.ok) throw data('Failed to load users', { status: 502 });
  return { users: result.value };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await identityGateway(context.cloudflare.env.API).createUser({
    email: String(form.get('email') ?? '').trim(),
    name: String(form.get('name') ?? '').trim(),
  });
  if (result.ok) return { error: null };
  return data({ error: result.message }, { status: result.status });
}

export default function Users({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Users</h1>
      <Form method="post" key={loaderData.users.length} className="mb-6 flex flex-wrap gap-2">
        <input
          name="name"
          placeholder="Name"
          aria-label="Name"
          required
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          aria-label="Email"
          required
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add user'}
        </Button>
      </Form>
      {actionData?.error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {actionData.error}
        </p>
      ) : null}
      <UserList users={loaderData.users} />
    </main>
  );
}
