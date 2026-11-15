import { Layer } from 'effect';
import { OrgApiLive } from './application/org-api';
import { DrizzleEmployeeRecordRepositoryLive } from './infrastructure/drizzle-employee-record-repository';
import { DrizzlePublicHolidayRepositoryLive } from './infrastructure/drizzle-public-holiday-repository';
import { DrizzleTeamRepositoryLive } from './infrastructure/drizzle-team-repository';

const RepositoriesLive = Layer.mergeAll(
  DrizzleEmployeeRecordRepositoryLive,
  DrizzleTeamRepositoryLive,
  DrizzlePublicHolidayRepositoryLive,
);

/**
 * Everything the org module provides: the facade and its Drizzle repositories. Requires
 * `Database`; the host also provides `UnitOfWork`.
 */
export const OrgModuleLive = OrgApiLive.pipe(Layer.provideMerge(RepositoriesLive));
