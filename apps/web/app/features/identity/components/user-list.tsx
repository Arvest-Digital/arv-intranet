import type { AccessRole, UserWithAccessRoles } from '@arv/contracts/identity';
import { MoreHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Access roles</TableHead>
          <TableHead>Added</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell className="text-muted-foreground">
              {user.accessRoles.length === 0
                ? 'None'
                : user.accessRoles.map((role) => role.name).join(', ')}
            </TableCell>
            <TableCell className="num">{user.createdAt.toISOString().slice(0, 10)}</TableCell>
            <TableCell className="text-right">
              <UserActions user={user} roles={roles} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={() => setDialog('roles')}>Access roles…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog('rename')}>Rename…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog('remove')}>
            Remove…
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
