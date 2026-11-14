import type { AccessRole } from '@arv/contracts/identity';
import { PlusIcon } from 'lucide-react';
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
  companyDomain,
  defaultOpen = false,
}: {
  roles: ReadonlyArray<AccessRole>;
  /** The company domain, for the address hint; none when unknown. */
  companyDomain?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon aria-hidden="true" />
        Add user
      </DialogTrigger>
      <DialogContent>
        <AddUserForm roles={roles} companyDomain={companyDomain} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddUserForm({
  roles,
  companyDomain,
  onDone,
}: {
  roles: ReadonlyArray<AccessRole>;
  companyDomain?: string;
  onDone: () => void;
}) {
  const { fetcher, submitting, fieldError, alertError } = useDialogFetcher(onDone);
  const [ticked, setTicked] = useState(
    () => new Set(roles.filter((role) => role.isPreselected).map((role) => role.id)),
  );

  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add user</DialogTitle>
        <DialogDescription>
          They can sign in with their Google account once they're on the list.
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={Intent.add} />
      <FormError error={alertError} />
      <Field
        label="Email"
        name="email"
        type="email"
        required
        placeholder={companyDomain ? `name@${companyDomain}` : undefined}
        hint={companyDomain ? `Must be an @${companyDomain} address` : undefined}
        error={fieldError('email')}
      />
      <Field
        label="Name"
        name="name"
        required
        maxLength={100}
        placeholder="First and last name"
        error={fieldError('name')}
      />
      <AccessRoleChoices
        roles={roles}
        showPreselected
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
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add user'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
