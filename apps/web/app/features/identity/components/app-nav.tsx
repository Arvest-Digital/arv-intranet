import type { Me } from '@arv/contracts/identity';
import { ChevronDownIcon, LogOutIcon } from 'lucide-react';
import { Link, NavLink, useMatch, useSubmit } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { ThemeToggle } from '~/shared/theme/theme-toggle';
import { Button } from '~/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';
import { canManageAccess } from '../gate';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex h-8 items-center rounded-md px-3 font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30',
    isActive && 'text-foreground',
  );

/** Up to two initials for the account avatar: «Ann Person» → «AP». */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

/** The app shell's top bar: brand, links by permission, theme and the signed-in user's menu. */
export function AppNav({ me }: { me: Me }) {
  // «Access» covers both the access list and the access roles.
  const inAccess = useMatch('/access/*') !== null;
  return (
    <header className="flex h-14 items-center gap-6 border-b border-border bg-background px-6 text-sm max-sm:h-auto max-sm:flex-wrap max-sm:gap-x-4 max-sm:gap-y-0 max-sm:px-4 max-sm:py-2">
      <Link
        to="/"
        className="text-base font-semibold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/30 max-sm:leading-10"
      >
        ARV Intranet
      </Link>
      <nav
        aria-label="Main"
        className="flex gap-1 max-sm:order-3 max-sm:-mx-3 max-sm:w-full max-sm:pb-1"
      >
        <NavLink to="/" end className={linkClass}>
          Home
        </NavLink>
        {canManageAccess(me) ? (
          <NavLink
            to="/access/users"
            className={({ isActive }) => linkClass({ isActive: isActive || inAccess })}
          >
            Access
          </NavLink>
        ) : null}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <AccountMenu me={me} />
      </div>
    </header>
  );
}

function AccountMenu({ me }: { me: Me }) {
  const submit = useSubmit();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="px-2" />}>
        <span
          aria-hidden="true"
          className="grid size-6 place-items-center rounded-sm bg-secondary text-xs font-medium text-secondary-foreground"
        >
          {initialsOf(me.name)}
        </span>
        <span className="max-sm:sr-only">{me.name}</span>
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col px-2 py-1.5 text-sm text-popover-foreground">
            <span className="font-medium">{me.name}</span>
            <span className="text-xs text-muted-foreground">{me.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* Sign-out changes state: POST, so the action's Origin check applies (AC-20). */}
        <DropdownMenuItem onClick={() => submit(null, { method: 'post', action: '/sign-out' })}>
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
