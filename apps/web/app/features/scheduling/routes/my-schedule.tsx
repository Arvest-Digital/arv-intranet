import { SchedulingErrorCodes } from '@arv/contracts/scheduling';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { data, Link } from 'react-router';
import { refusalResponse } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { Button, buttonVariants } from '~/shared/ui/button';
import { mondayOf, myScheduleHref, parseBoardParams, windowLabel, windowNav } from '../board';
import { BoardLegend } from '../components/board-legend';
import { WindowOutOfRange } from '../components/board-states';
import { MyAllocations, MyWeekCards, MyWeekStrip, NotSetUp } from '../components/my-schedule';
import { schedulingGateway } from '../scheduling.server';
import type { Route } from './+types/my-schedule';

export const meta: Route.MetaFunction = () => [{ title: 'My schedule · ARV Intranet' }];

/**
 * The signed-in user's own schedule, read-only, week by week (US-06, AC-17), for the window in the
 * URL (`from`, `weeks`). A login not linked to an employee record gets AC-18's explanation.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { from, weeks } = parseBoardParams(new URL(request.url).searchParams);
  const gateway = schedulingGateway(context.cloudflare.env.API, await getSessionToken(request));
  const today = new Date().toISOString().slice(0, 10);

  const schedule = await gateway.getMySchedule({ from, weeks });
  if (!schedule.ok) {
    if (schedule.code === SchedulingErrorCodes.notAResource) {
      return data({ kind: 'not-set-up' as const }, { status: 404 });
    }
    const refused = await refusalResponse(schedule, request);
    if (refused) throw refused;
    if (schedule.code === SchedulingErrorCodes.windowOutOfRange) {
      return data({ kind: 'out-of-range' as const, message: schedule.message }, { status: 400 });
    }
    throw data('Could not load your schedule', { status: 502 });
  }
  return { kind: 'schedule' as const, weeks, today, schedule: schedule.value };
}

function Step({
  to,
  label,
  children,
}: {
  to: string | null;
  label?: string;
  children: React.ReactNode;
}) {
  const size = label ? 'icon' : 'default';
  if (to === null) {
    return (
      <Button variant="outline" size={size} aria-label={label} disabled>
        {children}
      </Button>
    );
  }
  return (
    <Link
      to={to}
      aria-label={label}
      preventScrollReset
      className={buttonVariants({ variant: 'outline', size })}
    >
      {children}
    </Link>
  );
}

export default function MyScheduleRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === 'not-set-up') {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">My schedule</h1>
        <NotSetUp />
      </main>
    );
  }
  if (loaderData.kind === 'out-of-range') {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">My schedule</h1>
        <WindowOutOfRange message={loaderData.message} />
      </main>
    );
  }

  const { schedule, today, weeks } = loaderData;
  const currentMonday = mondayOf(today);
  const nav = windowNav(today, schedule.from, weeks);
  const team = schedule.employee.team?.name ?? 'No team';

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">My schedule</h1>
        <p className="text-sm text-muted-foreground">
          {schedule.employee.fullName} · {team}
          <span className="sm:hidden"> · read-only</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Step
          to={nav.prev === null ? null : myScheduleHref({ from: nav.prev, weeks })}
          label="Previous week"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Step>
        <Step to={nav.today === null ? null : myScheduleHref({ from: null, weeks })}>Today</Step>
        <Step
          to={nav.next === null ? null : myScheduleHref({ from: nav.next, weeks })}
          label="Next week"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Step>
        <span className="num mx-1 ml-2 text-[13px] whitespace-nowrap" aria-live="polite">
          {windowLabel(schedule.weeks)}
        </span>
      </div>
      <div className="flex flex-col gap-2 max-sm:hidden">
        <MyWeekStrip schedule={schedule} currentMonday={currentMonday} />
        <div className="overflow-hidden rounded-lg border border-border [&>footer]:border-t-0">
          <BoardLegend showAttention={false} />
        </div>
      </div>
      <div className="sm:hidden">
        <MyWeekCards schedule={schedule} currentMonday={currentMonday} />
      </div>
      <div className="max-sm:hidden">
        <MyAllocations schedule={schedule} />
      </div>
    </main>
  );
}
