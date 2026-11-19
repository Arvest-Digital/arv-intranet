import type { Project } from '@arv/contracts/projects';
import { CircleCheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { data, useRouteLoaderData } from 'react-router';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import type { loader as rootLoader } from '../../../root';
import { ProjectCloseDialog } from '../components/project-close-dialog';
import { ProjectCreateDialog } from '../components/project-create-dialog';
import { ProjectList } from '../components/project-list';
import {
  dateText,
  isIsoDate,
  isProjectType,
  MANAGE_PROJECTS,
  MANAGE_PROJECTS_LABEL,
  PROJECT_MESSAGE,
  type ProjectActionResult,
} from '../project';
import { projectFailure } from '../project-action.server';
import { projectsGateway } from '../projects.server';
import type { Route } from './+types/projects';

export const meta: Route.MetaFunction = () => [{ title: 'Projects · ARV Intranet' }];

/**
 * Every project the viewer may see. Without manage-projects or a board permission the api answers
 * 403 and the page names manage projects (AC-26).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const gateway = projectsGateway(context.cloudflare.env.API, await getSessionToken(request));
  const projects = await gateway.listProjects();
  if (!projects.ok) {
    throw (
      (await refusalResponse(projects, request, MANAGE_PROJECTS_LABEL)) ??
      data('Could not load the projects', { status: 502 })
    );
  }
  return { projects: projects.value, today: new Date().toISOString().slice(0, 10) };
}

/**
 * Create (AC-23, AC-24) or close — first without `confirm` to get the trims and removals, then
 * resent with `confirm` (AC-25). Without manage-projects the api answers 403 (AC-26).
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const intent = form.get('intent');
  const gateway = projectsGateway(context.cloudflare.env.API, await getSessionToken(request));

  if (intent === 'create') {
    const name = String(form.get('name') ?? '').trim();
    const type = String(form.get('type') ?? '');
    const fieldErrors = {
      ...(name === '' ? { name: PROJECT_MESSAGE.name } : {}),
      ...(name.length > 200 ? { name: PROJECT_MESSAGE.nameTooLong } : {}),
      ...(isProjectType(type) ? {} : { type: PROJECT_MESSAGE.type }),
    };
    if (Object.keys(fieldErrors).length > 0 || !isProjectType(type)) {
      return data<ProjectActionResult>(
        { ok: false, kind: 'invalid', fieldErrors },
        { status: 400 },
      );
    }
    const result = await gateway.createProject({ name, type });
    if (result.ok) {
      return {
        ok: true,
        intent: 'create',
        projectId: result.value.id,
      } satisfies ProjectActionResult;
    }
    const refused = await refusalResponse(result, request, MANAGE_PROJECTS_LABEL);
    if (refused) throw refused;
    return data<ProjectActionResult>(projectFailure(result, { name }), { status: result.status });
  }

  if (intent === 'close') {
    const projectId = String(form.get('projectId') ?? '');
    const closeDate = String(form.get('closeDate') ?? '').trim();
    if (!isIsoDate(closeDate)) {
      return data<ProjectActionResult>(
        { ok: false, kind: 'invalid', fieldErrors: { closeDate: PROJECT_MESSAGE.closeDate } },
        { status: 400 },
      );
    }
    const result = await gateway.closeProject(projectId, {
      closeDate,
      ...(form.get('confirm') === 'true' ? { confirm: true } : {}),
    });
    if (result.ok) {
      return {
        ok: true,
        intent: 'close',
        projectId: result.value.id,
        closeDate: result.value.closeDate ?? closeDate,
      } satisfies ProjectActionResult;
    }
    const refused = await refusalResponse(result, request, MANAGE_PROJECTS_LABEL);
    if (refused) throw refused;
    return data<ProjectActionResult>(projectFailure(result, {}), { status: result.status });
  }

  return data<ProjectActionResult>(
    { ok: false, kind: 'error', error: 'Unknown action' },
    { status: 400 },
  );
}

type Done = { readonly projectId: string; readonly message: string };

export default function Projects({ loaderData }: Route.ComponentProps) {
  const { projects, today } = loaderData;
  const me = useRouteLoaderData<typeof rootLoader>('root')?.me;
  const canManage = me?.permissions.includes(MANAGE_PROJECTS) ?? false;
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<Project | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const nameOf = (projectId: string) => projects.find((p) => p.id === projectId)?.name;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Projects</h1>
      {done ? (
        <Alert role="status" className="pr-12">
          <CircleCheckIcon aria-hidden="true" />
          <p>{done.message}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            className="absolute top-2 right-2"
            onClick={() => setDone(null)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </Alert>
      ) : null}
      <ProjectList
        projects={projects}
        canManage={canManage}
        highlightId={done?.projectId}
        onClose={setClosing}
        action={
          canManage ? (
            <Button aria-haspopup="dialog" onClick={() => setCreating(true)}>
              <PlusIcon aria-hidden="true" />
              New project
            </Button>
          ) : null
        }
      />
      {canManage ? (
        <>
          <ProjectCreateDialog
            open={creating}
            onOpenChange={setCreating}
            onCreated={(projectId) =>
              setDone({ projectId, message: `Project ${nameOf(projectId) ?? ''} created.` })
            }
          />
          <ProjectCloseDialog
            project={closing}
            today={today}
            onOpenChange={(open) => {
              if (!open) setClosing(null);
            }}
            onClosed={(projectId, closeDate) =>
              setDone({
                projectId,
                message: `${nameOf(projectId) ?? 'The project'} closes after ${dateText(closeDate)}.`,
              })
            }
          />
        </>
      ) : null}
    </main>
  );
}
