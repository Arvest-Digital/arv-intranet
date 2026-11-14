import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('sign-in', 'features/identity/routes/sign-in.tsx'),
  route('sign-in/return', 'features/identity/routes/sign-in-return.tsx'),
  route('sign-out', 'features/identity/routes/sign-out.tsx'),
  route('access/users', 'features/identity/routes/access-users.tsx'),
  route('access/roles', 'features/identity/routes/access-roles.tsx'),
  route('access/roles/new', 'features/identity/routes/access-role-edit.tsx', {
    id: 'access-role-new',
  }),
  route('access/roles/:accessRoleId', 'features/identity/routes/access-role-edit.tsx'),
  route('theme', 'routes/theme.ts'),
  // Dev-only UI showcase; not registered in production builds.
  ...(process.env.NODE_ENV === 'production' ? [] : [route('dev/ui', 'routes/dev.ui.tsx')]),
  // Last: unknown paths still pass the root gate before their 404.
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
