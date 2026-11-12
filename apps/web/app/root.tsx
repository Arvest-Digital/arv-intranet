import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';
import { AppNav } from '~/features/identity/components/app-nav';
import {
  AccessRemovedScreen,
  MissingPermissionNotice,
  SignedOutErrorScreen,
} from '~/features/identity/components/refusal-screens';
import { refusalOf } from '~/features/identity/gate';
import { gate } from '~/features/identity/gate.server';
import { SYSTEM_THEME_SCRIPT, themeClass } from '~/shared/theme/theme';
import { getTheme } from '~/shared/theme/theme.server';
import { useTheme, useThemeClass } from '~/shared/theme/use-theme';
import type { Route } from './+types/root';
import stylesheet from './app.css?url';

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: stylesheet }];

/** Every page passes the gate first (ADR-0002); `me` is null only on the public sign-in pages. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const [theme, me] = await Promise.all([
    getTheme(request),
    gate(request, context.cloudflare.env.API),
  ]);
  return { theme, me };
}

/** Re-check the session on every navigation, so a removed user's next action is refused (AC-07). */
export const shouldRevalidate = () => true;

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  useThemeClass(theme);
  // The app shell is for a signed-in user only; public and refusal screens render bare.
  const me = useRouteLoaderData<typeof loader>('root')?.me;

  return (
    // `system` adds `.dark` in the browser (script below), so the server class can differ.
    <html lang="en" className={themeClass(theme)} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {theme === 'system' && (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static script, must run before first paint
          <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
        )}
        <Meta />
        <Links />
      </head>
      <body className={me ? 'mx-auto max-w-3xl px-4 py-8' : undefined}>
        {me ? <AppNav me={me} /> : null}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const signedIn = useRouteLoaderData<typeof loader>('root')?.me != null;
  const refusal = refusalOf(error);
  if (refusal === 'access-removed') return <AccessRemovedScreen />;
  if (refusal === 'missing-permission') return <MissingPermissionNotice />;

  if (!isRouteErrorResponse(error)) console.error(error);
  // Without a session check that passed, show nothing but the error (fail closed).
  if (!signedIn) return <SignedOutErrorScreen />;
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText || error.data}`
    : 'Something went wrong';
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Error</h1>
      <p>{message}</p>
    </main>
  );
}
