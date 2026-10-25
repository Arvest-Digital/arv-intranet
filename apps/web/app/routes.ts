import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('users', 'features/identity/routes/users.tsx'),
  route('theme', 'routes/theme.ts'),
  // Dev-only UI showcase; not registered in production builds.
  ...(process.env.NODE_ENV === 'production' ? [] : [route('dev/ui', 'routes/dev.ui.tsx')]),
] satisfies RouteConfig;
