import { Layer } from 'effect';
import { SchedulingApiLive } from './application/scheduling-api';
import { DrizzleAllocationRepositoryLive } from './infrastructure/drizzle-allocation-repository';
import { DrizzleAllocationHistoryRepositoryLive } from './infrastructure/drizzle-history-repository';
import { DrizzleImportRunRepositoryLive } from './infrastructure/drizzle-import-run-repository';

// org's and projects' ports, implemented here and wired by the host (ADR-0007). Each requires
// scheduling's repositories, `OrgApi` and `Today`.
export { CapacityImpactCheckLive } from './application/capacity-impact-check';
export { ProjectClosingHookLive } from './application/project-closing-hook';

const RepositoriesLive = Layer.mergeAll(
  DrizzleAllocationRepositoryLive,
  DrizzleAllocationHistoryRepositoryLive,
  DrizzleImportRunRepositoryLive,
);

/** Everything the scheduling module provides: the facade and its Drizzle repositories. Requires `Database`. */
export const SchedulingModuleLive = SchedulingApiLive.pipe(Layer.provideMerge(RepositoriesLive));
