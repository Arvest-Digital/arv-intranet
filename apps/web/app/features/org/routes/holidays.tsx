import { CircleCheckIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { data, useRouteLoaderData } from 'react-router';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { Alert } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import type { loader as rootLoader } from '../../../root';
import { HolidayAddDialog } from '../components/holiday-add-dialog';
import { HolidayList } from '../components/holiday-list';
import {
  HOLIDAY_MESSAGE,
  type HolidayActionResult,
  isIsoDate,
  longDateText,
  MANAGE_HOLIDAY_LIST,
  MANAGE_HOLIDAY_LIST_LABEL,
  yearChoices,
  yearOf,
} from '../holiday';
import { orgGateway } from '../org.server';
import { holidayFailure } from '../team-holiday-action.server';
import type { Route } from './+types/holidays';

export const meta: Route.MetaFunction = () => [{ title: 'Holidays · ARV Intranet' }];

/** One year of the list (`?year=`, this year by default); anyone signed in may read it. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const now = new Date();
  const year = yearOf(new URL(request.url), now);
  const gateway = orgGateway(context.cloudflare.env.API, await getSessionToken(request));
  const holidays = await gateway.listPublicHolidays(`${year}-01-01`, `${year}-12-31`);
  if (!holidays.ok) {
    throw (
      (await refusalResponse(holidays, request)) ??
      data('Could not load the public holidays', { status: 502 })
    );
  }
  return {
    holidays: holidays.value,
    year,
    years: yearChoices(now.getUTCFullYear(), year),
  };
}

/**
 * Add (resent with `confirm` after the impact list, AC-19c, AC-27) or remove. Without
 * manage-holiday-list the api answers 403 and the page says which permission is missing (AC-28).
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const form = await request.formData();
  const intent = form.get('intent');
  const gateway = orgGateway(context.cloudflare.env.API, await getSessionToken(request));
  const holidayDate = String(form.get('holidayDate') ?? '').trim();

  if (intent === 'add') {
    const name = String(form.get('name') ?? '').trim();
    const fieldErrors = {
      ...(isIsoDate(holidayDate) ? {} : { holidayDate: HOLIDAY_MESSAGE.date }),
      ...(name === '' ? { name: HOLIDAY_MESSAGE.name } : {}),
      ...(name.length > 100 ? { name: HOLIDAY_MESSAGE.nameTooLong } : {}),
    };
    if (Object.keys(fieldErrors).length > 0) {
      return data<HolidayActionResult>(
        { ok: false, kind: 'invalid', fieldErrors },
        { status: 400 },
      );
    }
    const result = await gateway.addPublicHoliday({
      holidayDate,
      name,
      ...(form.get('confirm') === 'true' ? { confirm: true } : {}),
    });
    if (result.ok) {
      return {
        ok: true,
        intent: 'add',
        holidayDate: result.value.holidayDate,
      } satisfies HolidayActionResult;
    }
    const refused = await refusalResponse(result, request, MANAGE_HOLIDAY_LIST_LABEL);
    if (refused) throw refused;
    return data<HolidayActionResult>(holidayFailure(result, holidayDate), {
      status: result.status,
    });
  }

  if (intent === 'remove') {
    const result = await gateway.removePublicHoliday(String(form.get('publicHolidayId') ?? ''));
    if (result.ok) return { ok: true, intent: 'remove' } satisfies HolidayActionResult;
    const refused = await refusalResponse(result, request, MANAGE_HOLIDAY_LIST_LABEL);
    if (refused) throw refused;
    return data<HolidayActionResult>(holidayFailure(result, holidayDate), {
      status: result.status,
    });
  }

  return data<HolidayActionResult>(
    { ok: false, kind: 'error', error: 'Unknown action' },
    { status: 400 },
  );
}

export default function Holidays({ loaderData }: Route.ComponentProps) {
  const { holidays, year, years } = loaderData;
  const me = useRouteLoaderData<typeof rootLoader>('root')?.me;
  const canManage = me?.permissions.includes(MANAGE_HOLIDAY_LIST) ?? false;
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Holidays</h1>
        <p className="text-muted-foreground">
          One company-wide list. Holidays lower weekly capacity for everyone who would work that
          day.
        </p>
      </div>
      {added ? (
        <Alert role="status" className="pr-12">
          <CircleCheckIcon aria-hidden="true" />
          <p>
            Holiday added on <span className="num">{longDateText(added)}</span>.
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            className="absolute top-2 right-2"
            onClick={() => setAdded(null)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </Alert>
      ) : null}
      <HolidayList
        holidays={holidays}
        year={year}
        years={years}
        canManage={canManage}
        highlightDate={added ?? undefined}
        onAdd={() => setAdding(true)}
      />
      {canManage ? (
        <HolidayAddDialog open={adding} onOpenChange={setAdding} onAdded={setAdded} />
      ) : null}
    </main>
  );
}
