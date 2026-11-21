import { data } from 'react-router';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { ImportPage } from '../components/import-page';
import { IMPORT_MESSAGE, type ImportActionResult, type ImportPageData } from '../import';
import { importFailure, missingOf } from '../import-action.server';
import { schedulingGateway } from '../scheduling.server';
import type { Route } from './+types/import';

export const meta: Route.MetaFunction = () => [{ title: 'Import · ARV Intranet' }];

/**
 * The one-time import (US-11, flow 13): whether it has run, and its run when it has (AC-32).
 * Without all three import permissions the page names the ones missing (AC-33).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const gateway = schedulingGateway(context.cloudflare.env.API, await getSessionToken(request));
  const status = await gateway.getImportStatus();
  if (status.ok) return { kind: 'status', status: status.value } satisfies ImportPageData;
  if (status.status === 403) {
    return data<ImportPageData>({ kind: 'perms', missing: missingOf(status) }, { status: 403 });
  }
  const refused = await refusalResponse(status, request);
  if (refused) throw refused;
  throw data('Could not load the import', { status: 502 });
}

/**
 * Uploads the spreadsheet (multipart `file`). Without `confirm` the api only checks it: the
 * preview (AC-30) or the problem rows (AC-31) come back and nothing is saved. «Import everything»
 * sends the same file again with `confirm=true` (sad §8, warn-then-confirm). The file is never
 * stored here.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return data<ImportActionResult>(
      { kind: 'invalid', message: IMPORT_MESSAGE.noFile },
      { status: 400 },
    );
  }
  const gateway = schedulingGateway(context.cloudflare.env.API, await getSessionToken(request));
  const result = await gateway.importSpreadsheet(file, form.get('confirm') === 'true');
  if (result.ok) return { kind: 'success', run: result.value } satisfies ImportActionResult;
  if (result.status === 401) throw await refusalResponse(result, request);
  return data<ImportActionResult>(importFailure(result), { status: result.status });
}

export default function ImportRoute({ loaderData }: Route.ComponentProps) {
  return <ImportPage data={loaderData} />;
}
