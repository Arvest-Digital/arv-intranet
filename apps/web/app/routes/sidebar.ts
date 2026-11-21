import { data } from 'react-router';
import { parseSidebar } from '~/shell/sidebar';
import { serializeSidebar } from '~/shell/sidebar.server';
import type { Route } from './+types/sidebar';

// Resource route: collapsing the side navigation posts here; the root loader reads the cookie.
export async function action({ request }: Route.ActionArgs) {
  const sidebar = parseSidebar((await request.formData()).get('sidebar'));
  return data({ sidebar }, { headers: { 'Set-Cookie': await serializeSidebar(sidebar) } });
}
