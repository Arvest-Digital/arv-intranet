import { Context, Layer } from 'effect';

/** Facade for other modules. Add a method only when another module needs it. */
export class ProjectsApi extends Context.Tag('projects/ProjectsApi')<
  ProjectsApi,
  Record<never, never>
>() {}

export const ProjectsApiLive = Layer.succeed(ProjectsApi, {});
