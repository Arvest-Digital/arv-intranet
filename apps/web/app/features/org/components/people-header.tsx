import { NavLink } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { PATHS } from '~/shared/paths';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    '-mb-px inline-flex h-9 items-center border-b-2 border-transparent px-1 font-medium text-muted-foreground outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30',
    isActive && 'border-foreground text-foreground',
  );

/** «People» with its two sections: the employee records and the teams (US-07). */
export function PeopleHeader() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">People</h1>
      <nav aria-label="People sections" className="flex gap-4 border-b border-border">
        <NavLink to={PATHS.people} end className={tabClass}>
          Employees
        </NavLink>
        <NavLink to={PATHS.teams} className={tabClass}>
          Teams
        </NavLink>
      </nav>
    </div>
  );
}
