import { CalendarRangeIcon, FunnelXIcon, LockIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PATHS } from '~/shared/paths';
import { buttonVariants } from '~/shared/ui/button';

function EmptyState({
  icon,
  text,
  children,
}: {
  icon: React.ReactNode;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto my-24 flex max-w-sm flex-col items-center gap-3 px-4 text-center max-sm:my-12">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground [&_svg]:size-5"
      >
        {icon}
      </span>
      <p>{text}</p>
      {children}
    </div>
  );
}

/** AC-03: no other resource's schedule; offer the viewer's own schedule instead. */
export function BoardForbidden() {
  return (
    <main className="grid min-h-[50vh] place-items-center">
      <EmptyState icon={<LockIcon />} text="You don't have permission to view the team schedule">
        <Link to={PATHS.mySchedule} className={buttonVariants()}>
          Open my schedule
        </Link>
      </EmptyState>
    </main>
  );
}

/** A `from` / `weeks` the api refused (12 months back, 52 weeks ahead). */
export function WindowOutOfRange({ message }: { message: string }) {
  return (
    <EmptyState icon={<CalendarRangeIcon />} text={message}>
      <Link to="?" className={buttonVariants()}>
        Go to this week
      </Link>
    </EmptyState>
  );
}

/** Filters left nobody on the board. */
export function NoResults({ clearHref, what }: { clearHref: string; what: string }) {
  return (
    <div className="sticky left-0 w-full">
      <EmptyState icon={<FunnelXIcon />} text={`No ${what} match these filters.`}>
        <Link to={clearHref} className={buttonVariants()} preventScrollReset>
          Clear filters
        </Link>
      </EmptyState>
    </div>
  );
}

/** Nobody is allocated in the window (without filters). */
export function EmptyWindow({ weeks }: { weeks: number }) {
  return (
    <p
      role="status"
      className="sticky left-0 w-max max-w-[calc(100vw-2rem)] px-4 py-2.5 text-sm text-muted-foreground"
    >
      {weeks === 1 ? 'No allocations this week.' : `No allocations in these ${weeks} weeks.`}
    </p>
  );
}
