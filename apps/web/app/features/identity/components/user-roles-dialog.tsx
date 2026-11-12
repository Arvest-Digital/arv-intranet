import type { AccessRole, UserWithAccessRoles } from '@arv/contracts/identity';
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
} from '~/shared/ui/dialog';
import {
  AccessRoleChoices,
  combinedPermissions,
  Field,
  FormError,
  Intent,
  PermissionList,
  useDialogFetcher,
} from './access-list-form';

type DialogProps = {
  user: UserWithAccessRoles;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Assign or take away access roles (AC-12), showing what the ticked roles allow together in plain
 * words. Taking away the last admin's manage access is refused with the api's message (AC-14).
 */
export function UserRolesDialog({
  user,
  roles,
  open,
  onOpenChange,
}: DialogProps & { roles: ReadonlyArray<AccessRole> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <UserRolesForm user={user} roles={roles} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function UserRolesForm({
  user,
  roles,
  onDone,
}: {
  user: UserWithAccessRoles;
  roles: ReadonlyArray<AccessRole>;
  onDone: () => void;
}) {
  const { fetcher, submitting, error } = useDialogFetcher(onDone);
  const [ticked, setTicked] = useState(
    () => new Set(user.accessRoles.map((role) => role.id)) as ReadonlySet<string>,
  );

  return (
    <fetcher.Form method="post" className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Access roles of {user.name}</DialogTitle>
        <DialogDescription>{user.email}</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={Intent.setRoles} />
      <input type="hidden" name="userId" value={user.id} />
      <AccessRoleChoices
        roles={roles}
        isChecked={(id) => ticked.has(id)}
        onToggle={(id, checked) =>
          setTicked((current) => {
            const next = new Set(current);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
          })
        }
      />
      <section aria-labelledby={`combined-${user.id}`} className="grid gap-2">
        <h3 id={`combined-${user.id}`} className="font-medium">
          Together these roles allow
        </h3>
        <PermissionList permissions={combinedPermissions(roles, ticked)} />
      </section>
      <FormError error={error} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}

/** Correct the name; the email cannot change (AC-21). */
export function RenameUserDialog({ user, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <RenameUserForm user={user} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RenameUserForm({ user, onDone }: { user: UserWithAccessRoles; onDone: () => void }) {
  const { fetcher, submitting, error } = useDialogFetcher(onDone);
  return (
    <fetcher.Form method="post" className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Rename user</DialogTitle>
        <DialogDescription>
          The email address {user.email} cannot be changed. For a new address, remove this user and
          add the new one.
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={Intent.rename} />
      <input type="hidden" name="userId" value={user.id} />
      <Field label="Name" name="name" defaultValue={user.name} required maxLength={100} />
      <FormError error={error} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}

/** Confirm removal: every session ends and the roles go with the user (AC-07, AC-14). */
export function RemoveUserDialog({ user, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <RemoveUserForm user={user} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RemoveUserForm({ user, onDone }: { user: UserWithAccessRoles; onDone: () => void }) {
  const { fetcher, submitting, error } = useDialogFetcher(onDone);
  return (
    <fetcher.Form method="post" className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Remove {user.name}?</DialogTitle>
        <DialogDescription>
          {user.email} loses access on their next action and is signed out everywhere. Their access
          roles are removed too.
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={Intent.remove} />
      <input type="hidden" name="userId" value={user.id} />
      <FormError error={error} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" variant="destructive" disabled={submitting}>
          {submitting ? 'Removing…' : 'Remove'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
