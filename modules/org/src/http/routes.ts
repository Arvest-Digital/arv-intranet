import type { HttpEnv } from '@arv/platform/http';
import { Hono } from 'hono';

/** Mounted at `/` by the host, so paths here are the public paths (prefix them, e.g. `/org`). */
export const orgRoutes = new Hono<HttpEnv>();

/** Route types for the org client in apps/web (`hc<OrgRoutes>`). */
export type OrgRoutes = typeof orgRoutes;
