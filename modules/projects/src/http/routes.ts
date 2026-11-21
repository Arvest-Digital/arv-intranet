import {
  ProjectClose,
  ProjectCreate,
  ProjectIdPath,
  ProjectListQuery,
} from '@arv/contracts/projects';
import { ProjectId } from '@arv/kernel';
import { type HttpEnv, runEffect, validate } from '@arv/platform/http';
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import {
  closeProject,
  createProject,
  describeProject,
  listProjects,
} from '../application/projects';
import { ProjectName } from '../domain/project';
import { mapProjectsErrors, presentProject, presentProjectPage } from './presenter';

/** The contract already trimmed the name and bounded it, so this never fails. */
const toProjectName = (name: string) => Schema.decode(ProjectName)(name).pipe(Effect.orDie);

/**
 * Projects (openapi.yaml `/projects*`, US-08). Creating and closing require
 * `projects:manage-projects` (AC-26); listing also accepts the board's scheduling permissions and
 * leaves leave-type projects out for viewers who may not see leave reasons (AC-29). Each use case
 * checks access first.
 *
 * Mounted at `/` by the host, so paths here are the public paths.
 */
export const projectsRoutes = new Hono<HttpEnv>()
  .get('/projects', validate('query', ProjectListQuery), (c) =>
    runEffect(
      c,
      listProjects(c.req.valid('query')).pipe(Effect.map(presentProjectPage), mapProjectsErrors),
    ),
  )
  .post('/projects', validate('json', ProjectCreate), (c) => {
    const body = c.req.valid('json');
    return runEffect(
      c,
      toProjectName(body.name).pipe(
        Effect.flatMap((name) => createProject({ name, type: body.type })),
        Effect.flatMap(describeProject),
        Effect.map(presentProject),
        mapProjectsErrors,
      ),
      201,
    );
  })
  .post(
    '/projects/:projectId/close',
    validate('param', ProjectIdPath),
    validate('json', ProjectClose),
    (c) =>
      runEffect(
        c,
        closeProject(ProjectId.make(c.req.valid('param').projectId), c.req.valid('json')).pipe(
          Effect.flatMap(describeProject),
          Effect.map(presentProject),
          mapProjectsErrors,
        ),
      ),
  );

/** Route types for the projects client in apps/web (`hc<ProjectsRoutes>`). */
export type ProjectsRoutes = typeof projectsRoutes;
