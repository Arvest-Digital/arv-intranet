import type { HttpEnv } from '@arv/platform/http';
import { Hono } from 'hono';

/** Mounted at `/` by the host, so paths here are the public paths (prefix them, e.g. `/scheduling`). */
export const schedulingRoutes = new Hono<HttpEnv>();

/** Route types for the scheduling client in apps/web (`hc<SchedulingRoutes>`). */
export type SchedulingRoutes = typeof schedulingRoutes;
