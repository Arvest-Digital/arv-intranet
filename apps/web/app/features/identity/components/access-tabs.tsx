import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '~/shared/lib/utils';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    '-mb-px inline-flex h-10 items-center border-b-2 border-transparent font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/30',
    isActive && 'border-foreground text-foreground',
  );

/** «Access» heading with the page's primary action, and the Users / Roles tabs under it. */
export function AccessHeader({ action }: { action: ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Access</h1>
        {action}
      </div>
      <nav aria-label="Access" className="flex gap-6 border-b border-border">
        <NavLink to="/access/users" className={tabClass}>
          Users
        </NavLink>
        <NavLink to="/access/roles" end className={tabClass}>
          Roles
        </NavLink>
      </nav>
    </>
  );
}
