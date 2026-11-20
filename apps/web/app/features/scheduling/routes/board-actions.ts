import type { WorkRatePeriod } from '@arv/contracts/scheduling';
import { data } from 'react-router';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import {
  ALLOCATION_MESSAGE,
  type AllocationActionResult,
  dateErrors,
  type FieldErrors,
  parseRate,
} from '../allocation';
import { allocationFailure } from '../allocation-action.server';
import { isIsoDate } from '../board';
import { schedulingGateway } from '../scheduling.server';
import type { Route } from './+types/board-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const period = (value: string): WorkRatePeriod => (value === 'day' ? 'day' : 'week');

const invalid = (fieldErrors: FieldErrors, error?: string) =>
  data<AllocationActionResult>(
    { ok: false, kind: 'invalid', fieldErrors, ...(error ? { error } : {}) },
    { status: 400 },
  );

/** The board stays as it is: this route only answers the allocation dialog's fetcher. */
export function loader() {
  throw data('Not found', { status: 404 });
}

/**
 * The board's allocation writes (ADR-0002: edits are route actions): `create` (AC-07), `change`
 * (AC-09b) and `remove` (AC-07a), each sent first without `confirm`; an overbooking answer is
 * resent with `confirm=true` (AC-10, ADR-0010). Change and remove carry the `version` the
 * allocation was opened at, so a concurrent save is refused (AC-07b). The dates and hours are
 * checked here too, so plain mistakes never reach the api (AC-09).
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const intent = field(form, 'intent');
  const confirm = form.get('confirm') === 'true';
  const projectName = field(form, 'projectName') || undefined;
  const gateway = schedulingGateway(context.cloudflare.env.API, await getSessionToken(request));

  const refused = async (failed: Parameters<typeof allocationFailure>[0]) => {
    if (failed.status === 401) throw await refusalResponse(failed, request);
    return data<AllocationActionResult>(allocationFailure(failed, { projectName }), {
      status: failed.status,
    });
  };

  if (intent === 'create') {
    const employeeId = field(form, 'employeeId');
    const projectId = field(form, 'projectId');
    const startsOn = field(form, 'startsOn');
    const endsOn = field(form, 'endsOn');
    const ratePeriod = period(field(form, 'ratePeriod'));
    const rate = parseRate(field(form, 'rate'), ratePeriod);
    const fieldErrors: FieldErrors = {
      ...(UUID.test(employeeId) ? {} : { employeeId: [ALLOCATION_MESSAGE.employee] }),
      ...(UUID.test(projectId) ? {} : { projectId: [ALLOCATION_MESSAGE.project] }),
      ...dateErrors(startsOn, endsOn),
      ...(rate.ok ? {} : { rate: rate.errors }),
    };
    if (Object.keys(fieldErrors).length > 0 || !rate.ok) return invalid(fieldErrors);
    const result = await gateway.createAllocation({
      employeeId,
      projectId,
      startsOn,
      endsOn,
      rateMinutes: rate.minutes,
      ratePeriod,
      ...(confirm ? { confirm: true } : {}),
    });
    if (result.ok) {
      return {
        ok: true,
        intent: 'create',
        allocationId: result.value.id,
      } satisfies AllocationActionResult;
    }
    return refused(result);
  }

  const allocationId = field(form, 'allocationId');
  const version = Number(field(form, 'version'));
  if (!UUID.test(allocationId) || !Number.isInteger(version) || version < 1) {
    return data<AllocationActionResult>(
      { ok: false, kind: 'error', error: ALLOCATION_MESSAGE.gone },
      { status: 400 },
    );
  }

  if (intent === 'change') {
    // The start goes only when it may still change: a started allocation keeps its start (AC-09b).
    const startsOn = form.has('startsOn') ? field(form, 'startsOn') : null;
    const endsOn = field(form, 'endsOn');
    const ratePeriod = period(field(form, 'ratePeriod'));
    const rate = parseRate(field(form, 'rate'), ratePeriod);
    const fieldErrors: FieldErrors = {
      ...(startsOn === null
        ? isIsoDate(endsOn)
          ? {}
          : { endsOn: [ALLOCATION_MESSAGE.date] }
        : dateErrors(startsOn, endsOn)),
      ...(rate.ok ? {} : { rate: rate.errors }),
    };
    if (Object.keys(fieldErrors).length > 0 || !rate.ok) return invalid(fieldErrors);
    const result = await gateway.changeAllocation(allocationId, {
      version,
      ...(startsOn === null ? {} : { startsOn }),
      endsOn,
      rateMinutes: rate.minutes,
      ratePeriod,
      ...(confirm ? { confirm: true } : {}),
    });
    if (result.ok) {
      return {
        ok: true,
        intent: 'change',
        allocationId: result.value.id,
      } satisfies AllocationActionResult;
    }
    return refused(result);
  }

  if (intent === 'remove') {
    const result = await gateway.removeAllocation(allocationId, version);
    if (result.ok) {
      return {
        ok: true,
        intent: 'remove',
        outcome: result.value.outcome,
        endsOn: result.value.endsOn,
      } satisfies AllocationActionResult;
    }
    return refused(result);
  }

  return data<AllocationActionResult>(
    { ok: false, kind: 'error', error: 'Unknown action' },
    { status: 400 },
  );
}
