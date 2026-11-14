import type { HttpEnv } from '@arv/platform/http';
import { Hono } from 'hono';
import { accessListRoutes } from './access-list-routes';
import { accessRoleRoutes } from './access-role-routes';
import { signInRoutes } from './sign-in-routes';

/** Mounted at `/` by the host, so paths here are the public paths. */
export const identityRoutes = new Hono<HttpEnv>()
  .route('/', signInRoutes)
  .route('/', accessListRoutes)
  .route('/', accessRoleRoutes);

/** Route types for the identity client in apps/web (`hc<IdentityRoutes>`). */
export type IdentityRoutes = typeof identityRoutes;
