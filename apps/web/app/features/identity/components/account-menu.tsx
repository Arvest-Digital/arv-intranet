import type { Me } from '@arv/contracts/identity';
import { ChevronsUpDownIcon, LogOutIcon } from 'lucide-react';
import { useSubmit } from 'react-router';
import { cn } from '~/shared/lib/utils';
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

/** Up to two initials for the account avatar: «Ann Person» → «AP». */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

/**
 * The signed-in user and the sign-out. `compact` is the top bar's form (avatar and name);
 * otherwise it fills the side navigation's foot with the email under the name, and
 * `detailsClassName` lets a collapsed panel hide the text without dropping it from the name.
 */
export function AccountMenu({
  me,
  compact = false,
  detailsClassName,
}: {
  me: Me;
  compact?: boolean;
  detailsClassName?: string;
}) {
  const submit = useSubmit();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={compact ? 'sm' : 'default'}
            className={cn(
              compact ? 'px-2' : 'h-auto w-full justify-start gap-2.5 overflow-hidden px-1 py-1',
            )}
          />
        }
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid shrink-0 place-items-center rounded-sm bg-secondary text-xs font-medium text-secondary-foreground',
            compact ? 'size-6' : 'size-8',
          )}
        >
          {initialsOf(me.name)}
        </span>
        {compact ? (
          <span className="max-sm:sr-only">{me.name}</span>
        ) : (
          <span className={cn('flex min-w-0 flex-1 flex-col text-left', detailsClassName)}>
            <span className="truncate font-medium">{me.name}</span>
            {/* Keeps a space between name and email in the button's accessible name. */}{' '}
            <span className="truncate text-xs font-normal text-muted-foreground">{me.email}</span>
          </span>
        )}
        {compact ? null : (
          <ChevronsUpDownIcon aria-hidden="true" className={cn('shrink-0', detailsClassName)} />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={compact ? 'end' : 'start'}
        side={compact ? 'bottom' : 'top'}
        className="w-64"
      >
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
