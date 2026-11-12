import type { AccessRole } from '@arv/contracts/identity';
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
import { FormError, useDialogFetcher } from './access-list-form';
import { RoleIntent } from './access-role-form';

const holders = (count: number) =>
  count === 1 ? '1 user holds' : `${count === 0 ? 'No' : count} users hold`;

/**
 * Warns before deleting: how many hold the role and whether it is pre-selected, then confirms
 * (AC-11). Deleting the last source of manage access is refused inline (AC-14).
 */
export function DeleteRoleDialog({
  role,
  open,
  onOpenChange,
}: {
  role: AccessRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DeleteRoleForm role={role} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleForm({ role, onDone }: { role: AccessRole; onDone: () => void }) {
  const { fetcher, submitting, error } = useDialogFetcher(onDone);
  return (
    <fetcher.Form method="post" className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Delete {role.name}?</DialogTitle>
        <DialogDescription>
          {holders(role.holderCount)} this role.
          {role.holderCount > 0
            ? ' From their next action they lose what it grants, unless another of their roles grants it.'
            : null}
        </DialogDescription>
      </DialogHeader>
      {role.isPreselected ? (
        <p>
          {role.name} is pre-selected for new people. After deleting it, no role is pre-selected.
        </p>
      ) : null}
      <input type="hidden" name="intent" value={RoleIntent.remove} />
      <input type="hidden" name="accessRoleId" value={role.id} />
      <FormError error={error} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" variant="destructive" disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
