import { Layer } from 'effect';
import { ProjectsApiLive } from './application/projects-api';
import { DrizzleProjectRepositoryLive } from './infrastructure/drizzle-project-repository';

/** Everything the projects module provides: the facade and its Drizzle repository. Requires `Database`. */
export const ProjectsModuleLive = ProjectsApiLive.pipe(
  Layer.provideMerge(DrizzleProjectRepositoryLive),
);
