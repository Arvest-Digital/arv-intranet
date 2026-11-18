import { Layer } from 'effect';
import { ProjectsApiLive } from './application/projects-api';
import { DrizzleProjectRepositoryLive } from './infrastructure/drizzle-project-repository';

export { ProjectClosingHookNoop } from './application/ports';

/**
 * Everything the projects module provides: the facade and its Drizzle repository. Requires
 * `Database`; the host also provides `UnitOfWork`, `Today` and a `ProjectClosingHook` —
 * scheduling's, or `ProjectClosingHookNoop` when composed without it (ADR-0007).
 */
export const ProjectsModuleLive = ProjectsApiLive.pipe(
  Layer.provideMerge(DrizzleProjectRepositoryLive),
);
