import { NavLink } from 'react-router';
import { cn } from '~/shared/lib/utils';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-2 py-1 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30',
    isActive && 'bg-muted text-foreground',
  );

/** Switches between the access list and the access roles. */
export function AccessTabs() {
  return (
    <nav aria-label="Access" className="mb-4 flex gap-1 text-sm">
      <NavLink to="/access/users" className={tabClass}>
        Users
      </NavLink>
      <NavLink to="/access/roles" className={tabClass}>
        Access roles
      </NavLink>
    </nav>
  );
}
