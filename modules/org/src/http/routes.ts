import type { HttpEnv } from '@arv/platform/http';
import { Hono } from 'hono';
import { employeeRecordRoutes } from './employee-record-routes';
import { holidayRoutes } from './holiday-routes';
import { teamRoutes } from './team-routes';

/** Mounted at `/` by the host, so paths here are the public paths (prefix them, e.g. `/org`). */
export const orgRoutes = new Hono<HttpEnv>()
  .route('/', employeeRecordRoutes)
  .route('/', teamRoutes)
  .route('/', holidayRoutes);

/** Route types for the org client in apps/web (`hc<OrgRoutes>`). */
export type OrgRoutes = typeof orgRoutes;
