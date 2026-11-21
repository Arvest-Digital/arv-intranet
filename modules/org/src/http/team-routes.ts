import { TeamChange, TeamCreate, TeamIdPath } from '@arv/contracts/org';
import { PageQuery } from '@arv/contracts/shared';
import { EmployeeId } from '@arv/kernel';
import { type HttpEnv, runEffect, runEffectNoContent, validate } from '@arv/platform/http';
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import {
  changeTeam,
  createTeam,
  describeTeam,
  describeTeams,
  listTeams,
  removeTeam,
} from '../application/teams';
import { TeamId, TeamName } from '../domain/team';
import { mapOrgErrors } from './map-errors';
import { presentTeam, presentTeamPage } from './presenter';

/** The contract already trimmed the name and bounded it, so this never fails. */
const toTeamName = (name: string) => Schema.decode(TeamName)(name).pipe(Effect.orDie);

/**
 * Teams (openapi.yaml `/org/teams*`, flow 10, AC-19d). Writes require
 * `org:manage-employee-records`; listing also accepts the board's scheduling permissions
 * (api-sync-report D-5). Each use case checks access first.
 */
export const teamRoutes = new Hono<HttpEnv>()
  .get('/org/teams', validate('query', PageQuery), (c) =>
    runEffect(
      c,
      listTeams(c.req.valid('query')).pipe(
        Effect.flatMap((page) =>
          describeTeams(page.items).pipe(Effect.map((items) => ({ ...page, items }))),
        ),
        Effect.map(presentTeamPage),
        mapOrgErrors,
      ),
    ),
  )
  .post('/org/teams', validate('json', TeamCreate), (c) => {
    const body = c.req.valid('json');
    return runEffect(
      c,
      toTeamName(body.name).pipe(
        Effect.flatMap((name) =>
          createTeam({ name, teamLeadId: EmployeeId.make(body.teamLeadId) }),
        ),
        Effect.flatMap(describeTeam),
        Effect.map(presentTeam),
        mapOrgErrors,
      ),
      201,
    );
  })
  .patch('/org/teams/:teamId', validate('param', TeamIdPath), validate('json', TeamChange), (c) => {
    const id = TeamId.make(c.req.valid('param').teamId);
    const body = c.req.valid('json');
    return runEffect(
      c,
      Effect.gen(function* () {
        const name = body.name === undefined ? undefined : yield* toTeamName(body.name);
        return yield* changeTeam(id, {
          ...(name === undefined ? {} : { name }),
          ...(body.teamLeadId === undefined
            ? {}
            : { teamLeadId: EmployeeId.make(body.teamLeadId) }),
        });
      }).pipe(Effect.flatMap(describeTeam), Effect.map(presentTeam), mapOrgErrors),
    );
  })
  .delete('/org/teams/:teamId', validate('param', TeamIdPath), (c) =>
    runEffectNoContent(c, removeTeam(TeamId.make(c.req.valid('param').teamId)).pipe(mapOrgErrors)),
  );
