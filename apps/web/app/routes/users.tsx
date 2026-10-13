import { ApiErrorBody, User } from '@arv/contracts';
import { Option, Schema } from 'effect';
import { data, Form, useNavigation } from 'react-router';
import { UserList } from '../components/user-list';
import { createApiClient } from '../lib/api.server';
import type { Route } from './+types/users';

export const meta: Route.MetaFunction = () => [{ title: 'Users · ARV Intranet' }];

const decodeUsers = Schema.decodeUnknownSync(Schema.Array(User));
const decodeError = Schema.decodeUnknownOption(ApiErrorBody);

export async function loader({ context }: Route.LoaderArgs) {
  const api = createApiClient(context.cloudflare.env.API);
  const res = await api.users.$get();
  if (!res.ok) throw data('Failed to load users', { status: 502 });
  return { users: decodeUsers(await res.json()) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const api = createApiClient(context.cloudflare.env.API);
  const res = await api.users.$post({
    json: {
      email: String(form.get('email') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
    },
  });
  if (res.ok) return { error: null };

  const message = decodeError(await res.json()).pipe(
    Option.map((body) => body.error.message),
    Option.getOrElse(() => 'Could not create user'),
  );
  return data({ error: message }, { status: res.status });
}

export default function Users({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';

  return (
    <main>
      <h1>Users</h1>
      <Form method="post" key={loaderData.users.length}>
        <input name="name" placeholder="Name" aria-label="Name" required />
        <input name="email" type="email" placeholder="Email" aria-label="Email" required />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add user'}
        </button>
      </Form>
      {actionData?.error ? <p role="alert">{actionData.error}</p> : null}
      <UserList users={loaderData.users} />
    </main>
  );
}
