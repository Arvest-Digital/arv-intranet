import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import { SYSTEM_THEME_SCRIPT, themeClass } from '~/shared/theme/theme';
import { getTheme } from '~/shared/theme/theme.server';
import { ThemeToggle } from '~/shared/theme/theme-toggle';
import { useTheme, useThemeClass } from '~/shared/theme/use-theme';
import type { Route } from './+types/root';
import stylesheet from './app.css?url';

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: stylesheet }];

export async function loader({ request }: Route.LoaderArgs) {
  return { theme: await getTheme(request) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  useThemeClass(theme);

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
      <body className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-6 flex items-center gap-2 text-sm">
          <NavLink to="/">Home</NavLink> · <NavLink to="/users">Users</NavLink>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </nav>
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
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText || error.data}`
    : 'Something went wrong';
  if (!isRouteErrorResponse(error)) console.error(error);
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Error</h1>
      <p>{message}</p>
    </main>
  );
}
