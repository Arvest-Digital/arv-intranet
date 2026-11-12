import { type AccessRole, isRetired, type PermissionDeclaration } from '@arv/contracts/identity';
import { MoreHorizontalIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useFetcher } from 'react-router';
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
import { EditAccessRoleDialog, RoleIntent } from './access-role-form';
import { DeleteRoleDialog } from './delete-role-dialog';

/**
 * The access roles: permissions in plain words, holders, the pre-selected mark (AC-13) and a flag
 * naming every retired permission a role still grants (AC-16).
 */
export function AccessRoleList({
  roles,
  catalog,
}: {
  roles: ReadonlyArray<AccessRole>;
  catalog: ReadonlyArray<PermissionDeclaration>;
}) {
  if (roles.length === 0) return <p className="text-muted-foreground">No access roles yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Permissions</TableHead>
          <TableHead className="text-right">Holders</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roles.map((role) => (
          <TableRow key={role.id}>
            <TableCell className="align-top font-medium">
              {role.name}
              {role.isPreselected ? (
                <span className="ml-2 rounded-sm border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Pre-selected
                </span>
              ) : null}
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <RolePermissions role={role} />
            </TableCell>
            <TableCell className="num text-right align-top">{role.holderCount}</TableCell>
            <TableCell className="text-right align-top">
              <RoleActions role={role} catalog={catalog} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RolePermissions({ role }: { role: AccessRole }) {
  return (
    <div className="grid gap-1">
      <span className={role.permissions.length === 0 ? 'text-muted-foreground' : undefined}>
        {role.permissions.length === 0
          ? 'No permissions'
          : role.permissions.map((permission) => permission.name).join(', ')}
      </span>
      {isRetired(role) ? (
        <p className="flex items-start gap-1.5 text-destructive">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Grants retired {role.retiredPermissionKeys.length === 1 ? 'permission' : 'permissions'}{' '}
            {role.retiredPermissionKeys.map((key, index) => (
              <span key={key}>
                {index > 0 ? ', ' : null}
                <code className="font-mono text-xs">{key}</code>
              </span>
            ))}
          </span>
        </p>
      ) : null}
    </div>
  );
}

type OpenDialog = 'edit' | 'delete' | null;

function RoleActions({
  role,
  catalog,
}: {
  role: AccessRole;
  catalog: ReadonlyArray<PermissionDeclaration>;
}) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const openChange = (which: OpenDialog) => (open: boolean) => setDialog(open ? which : null);
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
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={() => setDialog('edit')}>Edit…</DropdownMenuItem>
          <DropdownMenuItem onClick={togglePreselected}>
            {role.isPreselected ? 'Clear pre-selected mark' : 'Pre-select for new people'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog('delete')}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormError error={preselectError} />
      <EditAccessRoleDialog
        role={role}
        catalog={catalog}
        open={dialog === 'edit'}
        onOpenChange={openChange('edit')}
      />
      <DeleteRoleDialog
        role={role}
        open={dialog === 'delete'}
        onOpenChange={openChange('delete')}
      />
    </>
  );
}
