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

const holders = (count: number) => {
  if (count === 0) return 'Nobody holds it.';
  const who = count === 1 ? '1 user holds it.' : `${count} users hold it.`;
  return `${who} They lose what it grants unless another of their roles grants it.`;
};

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
      <DialogContent showCloseButton={false}>
        <DeleteRoleForm role={role} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleForm({ role, onDone }: { role: AccessRole; onDone: () => void }) {
  const { fetcher, submitting, failure } = useDialogFetcher(onDone);
  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <DialogHeader className="pr-0">
        <DialogTitle>Delete {role.name}?</DialogTitle>
        <DialogDescription render={<div className="flex flex-col gap-2" />}>
          <p>{holders(role.holderCount)}</p>
          {role.isPreselected ? (
            <p>
              {role.name} is pre-selected for new users. After deleting, no role is pre-selected.
            </p>
          ) : null}
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={RoleIntent.remove} />
      <input type="hidden" name="accessRoleId" value={role.id} />
      <FormError error={failure?.error ?? null} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" variant="destructive" disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete role'}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}
