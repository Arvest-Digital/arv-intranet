import { SchedulingErrorCodes } from '@arv/contracts/scheduling';
import { data } from 'react-router';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { HISTORY_MESSAGE, type HistoryResult } from '../history';
import { schedulingGateway } from '../scheduling.server';
import type { Route } from './+types/allocation-history';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The history panel's data (US-05, flow 7): an allocation's changes over the last 12 months,
 * newest first (AC-16), already redacted for the viewer (AC-22, AC-29). A resource route the
 * panel's fetcher loads; a session the api no longer accepts goes to sign-in.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  if (!UUID.test(params.allocationId)) {
    return data<HistoryResult>({ kind: 'error', message: HISTORY_MESSAGE.gone }, { status: 404 });
  }
  const gateway = schedulingGateway(context.cloudflare.env.API, await getSessionToken(request));
  const result = await gateway.listAllocationHistory(params.allocationId);
  if (result.ok) {
    return {
      kind: 'list',
      entries: [...result.value]
        .reverse()
        .map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    } satisfies HistoryResult;
  }
  if (result.status === 401) throw await refusalResponse(result, request);
  const message =
    result.status === 403
      ? HISTORY_MESSAGE.forbidden
      : result.code === SchedulingErrorCodes.allocationNotFound
        ? HISTORY_MESSAGE.gone
        : HISTORY_MESSAGE.failed;
  return data<HistoryResult>({ kind: 'error', message }, { status: result.status });
}
