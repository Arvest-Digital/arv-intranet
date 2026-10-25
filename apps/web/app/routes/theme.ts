import { data } from 'react-router';
import { parseTheme } from '~/shared/theme/theme';
import { serializeTheme } from '~/shared/theme/theme.server';
import type { Route } from './+types/theme';

// Resource route: the theme toggle posts here; the root loader revalidates and reads the cookie.
export async function action({ request }: Route.ActionArgs) {
  const theme = parseTheme((await request.formData()).get('theme'));
  return data({ theme }, { headers: { 'Set-Cookie': await serializeTheme(theme) } });
}
