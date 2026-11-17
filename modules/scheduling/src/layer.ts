import { Layer } from 'effect';
import { SchedulingApiLive } from './application/scheduling-api';
import { DrizzleAllocationRepositoryLive } from './infrastructure/drizzle-allocation-repository';
import { DrizzleAllocationHistoryRepositoryLive } from './infrastructure/drizzle-history-repository';
import { DrizzleImportRunRepositoryLive } from './infrastructure/drizzle-import-run-repository';

const RepositoriesLive = Layer.mergeAll(
  DrizzleAllocationRepositoryLive,
  DrizzleAllocationHistoryRepositoryLive,
  DrizzleImportRunRepositoryLive,
);

/** Everything the scheduling module provides: the facade and its Drizzle repositories. Requires `Database`. */
export const SchedulingModuleLive = SchedulingApiLive.pipe(Layer.provideMerge(RepositoriesLive));
