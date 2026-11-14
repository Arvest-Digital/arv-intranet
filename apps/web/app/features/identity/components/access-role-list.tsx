import { type AccessRole, isRetired } from '@arv/contracts/identity';
import { MoreHorizontalIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useFetcher, useNavigate } from 'react-router';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table';
import { type AccessListActionResult, FormError } from './access-list-form';
import { RoleIntent } from './access-role-form';
import { DeleteRoleDialog } from './delete-role-dialog';

/** Where a role is edited. */
export const roleEditPath = (role: Pick<AccessRole, 'id'>) => `/access/roles/${role.id}`;

/**
 * The access roles: permissions in plain words, holders, the pre-selected mark (AC-13) and a flag
 * on every role that still grants a retired permission (AC-16).
 */
export function AccessRoleList({ roles }: { roles: ReadonlyArray<AccessRole> }) {
  if (roles.length === 0) return <p className="text-muted-foreground">No access roles yet.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead className="text-right">Holders</TableHead>
            <TableHead className="w-14">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    to={roleEditPath(role)}
                    className="font-medium underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/30"
                  >
                    {role.name}
                  </Link>
                  {role.isPreselected ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Pre-selected for new users
                    </Badge>
                  ) : null}
                  {isRetired(role) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
                      <TriangleAlertIcon aria-hidden="true" className="size-3.5" />
                      Grants a retired permission
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">
                {role.permissions.length === 0
                  ? 'No permissions'
                  : role.permissions.map((permission) => permission.name).join(', ')}
              </TableCell>
              <TableCell className="num text-right">{role.holderCount}</TableCell>
              <TableCell className="w-14 py-1.5 text-right">
                <RoleActions role={role} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RoleActions({ role }: { role: AccessRole }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const preselect = useFetcher<AccessListActionResult>();
  const preselectError =
    preselect.state === 'idle' && preselect.data && !preselect.data.ok
      ? preselect.data.error
      : null;

  // Marking one role unmarks the others; clearing leaves none (AC-13). Nobody's roles change.
  const togglePreselected = () =>
    preselect.submit(
      { intent: RoleIntent.preselect, accessRoleId: role.isPreselected ? '' : role.id },
      { method: 'post' },
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${role.name}`} />}
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onClick={() => navigate(roleEditPath(role))}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={togglePreselected}>
            {role.isPreselected ? 'Clear pre-selection' : 'Pre-select for new users'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {preselectError ? (
        <div className="mt-2 text-left whitespace-normal">
          <FormError error={preselectError} />
        </div>
      ) : null}
      <DeleteRoleDialog role={role} open={deleting} onOpenChange={setDeleting} />
    </>
  );
}
