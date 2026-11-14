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
import { Input } from '~/shared/ui/input';
import {
  AccessRoleChoices,
  combinedPermissions,
  Field,
  FormError,
  Intent,
  useDialogFetcher,
  WhatTheyCanDo,
} from './access-list-form';

type DialogProps = {
  user: UserWithAccessRoles;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * «Change roles»: assign or take away access roles (AC-12), showing what the ticked roles allow
 * together in plain words. Taking away the last admin's manage access is refused inline (AC-14).
 */
export function UserRolesDialog({
  user,
  roles,
  open,
  onOpenChange,
}: DialogProps & { roles: ReadonlyArray<AccessRole> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
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
  const { fetcher, submitting, failure } = useDialogFetcher(onDone);
  const [ticked, setTicked] = useState(
    () => new Set(user.accessRoles.map((role) => role.id)) as ReadonlySet<string>,
  );

  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Change roles</DialogTitle>
        <DialogDescription>
          {user.name} · {user.email}
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={Intent.setRoles} />
      <input type="hidden" name="userId" value={user.id} />
      <FormError error={failure?.error ?? null} />
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
      <WhatTheyCanDo permissions={combinedPermissions(roles, ticked)} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save roles'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}

/** «Edit name»: correct the name; the email cannot change (AC-21). */
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
  const { fetcher, submitting, fieldError, alertError } = useDialogFetcher(onDone);
  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit name</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="intent" value={Intent.rename} />
      <input type="hidden" name="userId" value={user.id} />
      <FormError error={alertError} />
      <Field
        label="Name"
        name="name"
        defaultValue={user.name}
        required
        maxLength={100}
        error={fieldError('name')}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor={`email-${user.id}`} className="font-medium">
          Email
        </label>
        <Input
          id={`email-${user.id}`}
          type="email"
          value={user.email}
          readOnly
          aria-describedby={`email-hint-${user.id}`}
          className="text-muted-foreground"
        />
        <p id={`email-hint-${user.id}`} className="text-xs text-muted-foreground">
          The email can't be changed. Remove the user and add the new address instead.
        </p>
      </div>
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
      <DialogContent showCloseButton={false}>
        <RemoveUserForm user={user} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RemoveUserForm({ user, onDone }: { user: UserWithAccessRoles; onDone: () => void }) {
  const { fetcher, submitting, failure } = useDialogFetcher(onDone);
  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <DialogHeader className="pr-0">
        <DialogTitle>Remove {user.name}?</DialogTitle>
        <DialogDescription>
          They lose access on their next action and are signed out on every device.
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={Intent.remove} />
      <input type="hidden" name="userId" value={user.id} />
      <FormError error={failure?.error ?? null} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" variant="destructive" disabled={submitting}>
          {submitting ? 'Removing…' : 'Remove'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
