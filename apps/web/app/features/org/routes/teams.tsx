import { data } from 'react-router';
import type { ApiFailure } from '~/shared/lib/api.server';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { PeopleHeader } from '../components/people-header';
import { TeamList } from '../components/team-list';
import { orgGateway } from '../org.server';
import { TEAM_MESSAGE, type TeamActionResult } from '../team';
import { teamFailure } from '../team-holiday-action.server';
import type { Route } from './+types/teams';

export const meta: Route.MetaFunction = () => [{ title: 'Teams · ARV Intranet' }];

/** Team writes need manage-employee-records (AC-19d); the refusal screen names it. */
const PERMISSION = 'manage employee records';

async function loadFailure(failed: ApiFailure, request: Request) {
  return (
    (await refusalResponse(failed, request, PERMISSION)) ??
    data('Could not load the teams', { status: 502 })
  );
}

/** The teams, and the records that give each its resource count and the team lead choices. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const gateway = orgGateway(context.cloudflare.env.API, await getSessionToken(request));
  const [teams, records] = await Promise.all([gateway.listTeams(), gateway.listEmployeeRecords()]);
  if (!teams.ok) throw await loadFailure(teams, request);
  if (!records.ok) throw await loadFailure(records, request);
  return { teams: teams.value, records: records.value };
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** Create, rename or remove, told apart by `intent`; refusals come back to the list (AC-19d). */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const intent = form.get('intent');
  const teamId = text(form, 'teamId');
  const name = text(form, 'name');
  const teamLeadId = text(form, 'teamLeadId');
  const gateway = orgGateway(context.cloudflare.env.API, await getSessionToken(request));

  if (intent === 'create' || intent === 'update') {
    const fieldErrors = {
      ...(name === '' ? { name: TEAM_MESSAGE.name } : {}),
      ...(intent === 'create' && teamLeadId === '' ? { teamLeadId: TEAM_MESSAGE.teamLead } : {}),
    };
    if (Object.keys(fieldErrors).length > 0) {
      return data<TeamActionResult>(
        { ok: false, kind: 'invalid', intent, ...(teamId ? { teamId } : {}), fieldErrors },
        { status: 400 },
      );
    }
  }

  const result = await (() => {
    switch (intent) {
      case 'create':
        return gateway.createTeam(name, teamLeadId);
      case 'update':
        return gateway.updateTeam(teamId, {
          name,
          ...(teamLeadId === '' ? {} : { teamLeadId }),
        });
      case 'remove':
        return gateway.removeTeam(teamId);
      default:
        return null;
    }
  })();

  if (result === null || (intent !== 'create' && intent !== 'update' && intent !== 'remove')) {
    return data<TeamActionResult>(
      { ok: false, kind: 'error', error: 'Unknown action' },
      { status: 400 },
    );
  }
  if (result.ok) {
    return {
      ok: true,
      intent,
      teamId: result.value?.id ?? teamId,
    } satisfies TeamActionResult;
  }
  const refused = await refusalResponse(result, request, PERMISSION);
  if (refused) throw refused;
  return data<TeamActionResult>(
    teamFailure(result, {
      intent,
      name,
      ...(teamId ? { teamId } : {}),
      team: text(form, 'teamName'),
    }),
    { status: result.status },
  );
}

export default function Teams({ loaderData }: Route.ComponentProps) {
  const { teams, records } = loaderData;
  return (
    <main className="flex flex-col gap-6">
      <PeopleHeader />
      <TeamList teams={teams} records={records} />
    </main>
  );
}
