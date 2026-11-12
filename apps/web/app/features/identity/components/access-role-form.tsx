import type { AccessRole, PermissionDeclaration } from '@arv/contracts/identity';
import { useState } from 'react';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/shared/ui/dialog';
import { Field, FormError, useDialogFetcher } from './access-list-form';
import { PermissionPicker } from './permission-picker';

/** The `intent` field each access-role form posts, so one action serves every dialog. */
export const RoleIntent = {
  create: 'create',
  update: 'update',
  remove: 'delete',
  preselect: 'preselect',
} as const;
export type RoleIntent = (typeof RoleIntent)[keyof typeof RoleIntent];

/** «New access role»: a name and declared permissions; nobody holds it yet (AC-09). */
export function NewAccessRoleDialog({
  catalog,
  defaultOpen = false,
}: {
  catalog: ReadonlyArray<PermissionDeclaration>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New access role</DialogTrigger>
      <DialogContent>
        <AccessRoleForm catalog={catalog} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Rename a role and change its permissions; retired keys can only be removed (AC-10, AC-16). */
export function EditAccessRoleDialog({
  role,
  catalog,
  open,
  onOpenChange,
}: {
  role: AccessRole;
  catalog: ReadonlyArray<PermissionDeclaration>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AccessRoleForm role={role} catalog={catalog} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The name and the full key set of a role, new (`role` absent) or existing. A duplicate name
 * (AC-10), a retired key (AC-16) or losing the last admin (AC-14) comes back inline.
 */
function AccessRoleForm({
  role,
  catalog,
  onDone,
}: {
  role?: AccessRole;
  catalog: ReadonlyArray<PermissionDeclaration>;
  onDone: () => void;
}) {
  const { fetcher, submitting, error } = useDialogFetcher(onDone);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () =>
      new Set([
        ...(role?.permissions.map((permission) => permission.key) ?? []),
        ...(role?.retiredPermissionKeys ?? []),
      ]),
  );

  return (
    <fetcher.Form method="post" className="grid max-h-[80vh] gap-6 overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{role ? `Edit ${role.name}` : 'New access role'}</DialogTitle>
        <DialogDescription>
          {role
            ? 'Changes apply to everyone holding this role from their next action.'
            : 'Nobody holds the new role until an admin assigns it.'}
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={role ? RoleIntent.update : RoleIntent.create} />
      {role ? <input type="hidden" name="accessRoleId" value={role.id} /> : null}
      <Field label="Name" name="name" defaultValue={role?.name} required maxLength={100} />
      <PermissionPicker
        catalog={catalog}
        retiredKeys={role?.retiredPermissionKeys ?? []}
        isChecked={(key) => ticked.has(key)}
        onToggle={(key, checked) =>
          setTicked((current) => {
            const next = new Set(current);
            if (checked) next.add(key);
            else next.delete(key);
            return next;
          })
        }
      />
      <FormError error={error} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : role ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
