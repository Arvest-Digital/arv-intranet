import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import type { Route } from './+types/root';
import stylesheet from './app.css?url';

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: stylesheet }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-6 flex gap-2 text-sm">
          <NavLink to="/">Home</NavLink> · <NavLink to="/users">Users</NavLink>
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
