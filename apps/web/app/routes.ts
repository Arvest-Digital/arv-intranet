import { index, layout, type RouteConfig, route } from '@react-router/dev/routes';
import { PATHS } from './shared/paths';

export default [
  index('routes/home.tsx'),
  route('sign-in', 'features/identity/routes/sign-in.tsx'),
  route('sign-in/return', 'features/identity/routes/sign-in-return.tsx'),
  route('sign-out', 'features/identity/routes/sign-out.tsx'),
  // A section is a pathless layout: its pages share the side navigation it describes.
  layout('sections/schedule.tsx', [
    route(PATHS.board, 'features/scheduling/routes/board.tsx'),
    route(PATHS.mySchedule, 'features/scheduling/routes/my-schedule.tsx'),
    route(PATHS.people, 'features/org/routes/employee-records.tsx'),
    route(PATHS.teams, 'features/org/routes/teams.tsx'),
    route(PATHS.projects, 'features/projects/routes/projects.tsx'),
    route(PATHS.holidays, 'features/org/routes/holidays.tsx'),
    route(PATHS.import, 'features/scheduling/routes/import.tsx'),
  ]),
  layout('sections/access.tsx', [
    route(PATHS.accessUsers, 'features/identity/routes/access-users.tsx'),
    route(PATHS.accessRoles, 'features/identity/routes/access-roles.tsx'),
    route(PATHS.accessRoleNew, 'features/identity/routes/access-role-edit.tsx', {
      id: 'access-role-new',
    }),
    route(PATHS.accessRole(':accessRoleId'), 'features/identity/routes/access-role-edit.tsx'),
  ]),
  // Resource routes: no page, so no section.
  route(PATHS.allocations, 'features/scheduling/routes/board-actions.ts'),
  route(
    PATHS.allocationHistory(':allocationId'),
    'features/scheduling/routes/allocation-history.ts',
  ),
  route('theme', 'routes/theme.ts'),
  route('sidebar', 'routes/sidebar.ts'),
  // Dev-only UI showcase; not registered in production builds.
  ...(process.env.NODE_ENV === 'production' ? [] : [route('dev/ui', 'routes/dev.ui.tsx')]),
  // Last: unknown paths still pass the root gate before their 404.
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
