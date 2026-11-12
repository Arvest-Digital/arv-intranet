import type { AccessRole } from '@arv/contracts/identity';
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
import { AccessRoleChoices, Field, FormError, Intent, useDialogFetcher } from './access-list-form';

/** «Add user»: address, name and access roles, the pre-selected one ticked (AC-04, AC-13). */
export function AddUserDialog({
  roles,
  defaultOpen = false,
}: {
  roles: ReadonlyArray<AccessRole>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add user</DialogTrigger>
      <DialogContent>
        <AddUserForm roles={roles} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddUserForm({ roles, onDone }: { roles: ReadonlyArray<AccessRole>; onDone: () => void }) {
  const { fetcher, submitting, error } = useDialogFetcher(onDone);
  const [ticked, setTicked] = useState(
    () => new Set(roles.filter((role) => role.isPreselected).map((role) => role.id)),
  );

  return (
    <fetcher.Form method="post" className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Add user</DialogTitle>
        <DialogDescription>
          They can sign in with their company Google account as soon as they are added.
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={Intent.add} />
      <Field label="Company email" name="email" type="email" required />
      <Field label="Name" name="name" required maxLength={100} />
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
      <FormError error={error} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add user'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
