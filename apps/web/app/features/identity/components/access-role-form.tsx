import type { AccessRole, PermissionDeclaration } from '@arv/contracts/identity';
import { ArrowLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { Form, Link, useNavigation } from 'react-router';
import { Button, buttonVariants } from '~/shared/ui/button';
import { type AccessListActionResult, CheckboxRow, Field, FormError } from './access-list-form';
import { PermissionPicker } from './permission-picker';

/** The `intent` field each access-role form posts, so one action serves every form. */
export const RoleIntent = {
  create: 'create',
  update: 'update',
  remove: 'delete',
  preselect: 'preselect',
} as const;
export type RoleIntent = (typeof RoleIntent)[keyof typeof RoleIntent];

/**
 * The role page: a name, declared permissions grouped by feature and the pre-selected mark, for a
 * new role (`role` absent, AC-09) or an existing one (AC-10, AC-13, AC-16). A duplicate name
 * shows under the name; losing the last admin (AC-14) shows as an alert above the buttons.
 */
export function AccessRoleForm({
  role,
  catalog,
  result,
}: {
  role?: AccessRole;
  catalog: ReadonlyArray<PermissionDeclaration>;
  /** The action's answer to the last submit, if it refused. */
  result?: AccessListActionResult;
}) {
  const submitting = useNavigation().state === 'submitting';
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () =>
      new Set([
        ...(role?.permissions.map((permission) => permission.key) ?? []),
        ...(role?.retiredPermissionKeys ?? []),
      ]),
  );
  const [preselected, setPreselected] = useState(role?.isPreselected ?? false);
  const failure = result && !result.ok ? result : null;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          to="/access/roles"
          className="inline-flex w-fit items-center gap-1 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Roles
        </Link>
        <h1 className="text-2xl font-semibold">{role ? `Edit ${role.name}` : 'New role'}</h1>
      </div>
      <Form method="post" className="flex max-w-[720px] flex-col gap-8">
        <input type="hidden" name="intent" value={role ? RoleIntent.update : RoleIntent.create} />
        {role ? <input type="hidden" name="accessRoleId" value={role.id} /> : null}
        <Field
          label="Name"
          name="name"
          defaultValue={role?.name}
          placeholder="For example, Planner"
          required
          maxLength={100}
          className="max-w-[400px]"
          error={failure?.field === 'name' ? failure.error : null}
        />
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
        <CheckboxRow
          name="preselected"
          value="on"
          checked={preselected}
          onCheckedChange={setPreselected}
          label="Pre-select for new users"
          labelClassName="font-medium"
          description={
            <span className="text-xs">
              Only one role can be pre-selected. Existing users don't change.
            </span>
          }
        />
        <FormError error={failure && !failure.field ? failure.error : null} />
        <div className="flex gap-2 max-sm:flex-col">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save role'}
          </Button>
          <Link to="/access/roles" className={buttonVariants({ variant: 'outline' })}>
            Cancel
          </Link>
        </div>
      </Form>
    </main>
  );
}
