import type { AccessRole, UserWithAccessRoles } from '@arv/contracts/identity';
import { MoreHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
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
import { RemoveUserDialog, RenameUserDialog, UserRolesDialog } from './user-roles-dialog';

/** The access list: who may sign in, with their access roles and the actions on each user. */
export function UserList({
  users,
  roles,
}: {
  users: ReadonlyArray<UserWithAccessRoles>;
  roles: ReadonlyArray<AccessRole>;
}) {
  if (users.length === 0) return <p className="text-muted-foreground">No users yet.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead className="max-sm:hidden">Email</TableHead>
            <TableHead>Access roles</TableHead>
            <TableHead className="w-14">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <span className="font-medium">{user.name}</span>
                <span className="block text-xs text-muted-foreground sm:hidden">{user.email}</span>
              </TableCell>
              <TableCell className="text-muted-foreground max-sm:hidden">{user.email}</TableCell>
              <TableCell className="whitespace-normal">
                {user.accessRoles.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {user.accessRoles.map((role) => (
                      <Badge key={role.id} variant="secondary">
                        {role.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="w-14 py-1.5 text-right">
                <UserActions user={user} roles={roles} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type OpenDialog = 'roles' | 'rename' | 'remove' | null;

function UserActions({
  user,
  roles,
}: {
  user: UserWithAccessRoles;
  roles: ReadonlyArray<AccessRole>;
}) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const openChange = (which: OpenDialog) => (open: boolean) => setDialog(open ? which : null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`} />}
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={() => setDialog('rename')}>Edit name</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog('roles')}>Change roles</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog('remove')}>
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UserRolesDialog
        user={user}
        roles={roles}
        open={dialog === 'roles'}
        onOpenChange={openChange('roles')}
      />
      <RenameUserDialog
        user={user}
        open={dialog === 'rename'}
        onOpenChange={openChange('rename')}
      />
      <RemoveUserDialog
        user={user}
        open={dialog === 'remove'}
        onOpenChange={openChange('remove')}
      />
    </>
  );
}
