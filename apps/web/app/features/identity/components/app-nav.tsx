import type { Me } from '@arv/contracts/identity';
import { ChevronDownIcon, LogOutIcon } from 'lucide-react';
import { NavLink, useSubmit } from 'react-router';
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
    'rounded-md px-2 py-1 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30',
    isActive && 'text-foreground',
  );

/** The app shell's navigation: links by permission, theme and the signed-in user's menu. */
export function AppNav({ me }: { me: Me }) {
  return (
    <nav aria-label="Main" className="mb-6 flex items-center gap-1 text-sm">
      <NavLink to="/" end className={linkClass}>
        Home
      </NavLink>
      {canManageAccess(me) ? (
        <NavLink to="/access/users" className={linkClass}>
          Access
        </NavLink>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <AccountMenu me={me} />
      </div>
    </nav>
  );
}

function AccountMenu({ me }: { me: Me }) {
  const submit = useSubmit();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        {me.name}
        <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{me.email}</DropdownMenuLabel>
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
