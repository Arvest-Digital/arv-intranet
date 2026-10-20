import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('users', 'features/identity/routes/users.tsx'),
] satisfies RouteConfig;
