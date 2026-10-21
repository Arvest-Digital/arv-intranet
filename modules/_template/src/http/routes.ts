import type { HttpEnv } from '@arv/platform/http';
import { Hono } from 'hono';

/** Mounted at `/` by the host, so paths here are the public paths (prefix them, e.g. `/skeleton`). */
export const skeletonRoutes = new Hono<HttpEnv>();

/** Route types for the skeleton client in apps/web (`hc<SkeletonRoutes>`). */
export type SkeletonRoutes = typeof skeletonRoutes;
