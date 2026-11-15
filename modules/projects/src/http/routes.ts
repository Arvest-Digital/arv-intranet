import type { HttpEnv } from '@arv/platform/http';
import { Hono } from 'hono';

/** Mounted at `/` by the host, so paths here are the public paths (prefix them, e.g. `/projects`). */
export const projectsRoutes = new Hono<HttpEnv>();

/** Route types for the projects client in apps/web (`hc<ProjectsRoutes>`). */
export type ProjectsRoutes = typeof projectsRoutes;
