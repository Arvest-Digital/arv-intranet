import type { ProjectsRoutes } from '@arv/api';
import { Project, ProjectPage, type ProjectType } from '@arv/contracts/projects';
import { PAGE_LIMIT_MAX } from '@arv/contracts/shared';
import { Schema } from 'effect';
import { hc } from 'hono/client';
import { API_BASE_URL, type ApiResult, bindingFetch, failure } from '../../shared/lib/api.server';

const decodePage = Schema.decodeUnknownSync(ProjectPage);
const decodeProject = Schema.decodeUnknownSync(Project);

/**
 * Projects API calls for loaders and actions. `sessionToken` is forwarded as
 * `Authorization: Bearer`. Responses are decoded with the contract schemas.
 */
export function projectsGateway(api: Fetcher, sessionToken: string | null) {
  const client = hc<ProjectsRoutes>(API_BASE_URL, { fetch: bindingFetch(api, sessionToken) });

  return {
    /**
     * Every project the viewer may see, by name (projects number in the hundreds at most). Leave
     * projects are left out for viewers who may not see leave reasons (AC-29).
     */
    async listProjects(): Promise<ApiResult<ReadonlyArray<Project>>> {
      const items: Project[] = [];
      let after: string | undefined;
      for (;;) {
        const res = await client.projects.$get({
          query: { limit: PAGE_LIMIT_MAX, ...(after ? { after } : {}) },
        });
        if (!res.ok) return failure(res, 'Could not load the projects');
        const page = decodePage(await res.json());
        items.push(...page.items);
        if (!page.hasNext || !page.nextCursor) return { ok: true, value: items };
        after = page.nextCursor;
      }
    },

    /** Creates an open project (AC-23); a name an open project has answers 409 (AC-24). */
    async createProject(input: {
      readonly name: string;
      readonly type: ProjectType;
    }): Promise<ApiResult<Project>> {
      const res = await client.projects.$post({ json: input });
      if (!res.ok) return failure(res, 'Could not create the project');
      return { ok: true, value: decodeProject(await res.json()) };
    },

    /**
     * Sets the close date (AC-25). Allocations it would trim or remove answer 409 with the list
     * until it is resent with `confirm: true`; without manage-projects it answers 403 (AC-26).
     */
    async closeProject(
      projectId: string,
      input: { readonly closeDate: string; readonly confirm?: boolean },
    ): Promise<ApiResult<Project>> {
      const res = await client.projects[':projectId'].close.$post({
        param: { projectId },
        json: { closeDate: input.closeDate, confirm: input.confirm === true },
      });
      if (!res.ok) return failure(res, 'Could not close the project');
      return { ok: true, value: decodeProject(await res.json()) };
    },
  };
}
