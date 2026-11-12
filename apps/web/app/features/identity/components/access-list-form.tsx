import type { AccessRole, PermissionDeclaration } from '@arv/contracts/identity';
import { type ComponentProps, useEffect, useId } from 'react';
import { useFetcher } from 'react-router';
import { Input } from '~/shared/ui/input';

/** What the access-list action answers each dialog: done, or the api's message to show inline. */
export type AccessListActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

/** The `intent` field each access-list form posts, so one action serves every dialog. */
export const Intent = {
  add: 'add',
  rename: 'rename',
  remove: 'remove',
  setRoles: 'set-roles',
} as const;
export type Intent = (typeof Intent)[keyof typeof Intent];

/**
 * A fetcher for one dialog's form: calls `onDone` once the action answers ok. Mount it inside the
 * dialog's popup, so a reopened dialog starts without the previous attempt's error.
 */
export function useDialogFetcher(onDone: () => void) {
  const fetcher = useFetcher<AccessListActionResult>();
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per answer, not per render
  useEffect(() => {
    if (result?.ok) onDone();
  }, [result]);
  return {
    fetcher,
    submitting: fetcher.state !== 'idle',
    error: result && !result.ok ? result.error : null,
  };
}

/** A labelled text input. */
export function Field({ label, ...props }: { label: string } & ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <Input id={id} autoComplete="off" {...props} />
    </div>
  );
}

/** The api's refusal, shown where the admin acted (AC-05, AC-06, AC-14). */
export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

/** Ticks for the access roles to hold; posted as repeated `accessRoleId` fields. */
export function AccessRoleChoices({
  roles,
  isChecked,
  onToggle,
}: {
  roles: ReadonlyArray<AccessRole>;
  isChecked: (roleId: string) => boolean;
  onToggle: (roleId: string, checked: boolean) => void;
}) {
  if (roles.length === 0) {
    return <p className="text-muted-foreground">No access roles yet.</p>;
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-medium">Access roles</legend>
      {roles.map((role) => (
        <label key={role.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            name="accessRoleId"
            value={role.id}
            checked={isChecked(role.id)}
            onChange={(event) => onToggle(role.id, event.currentTarget.checked)}
            className="size-4 accent-primary"
          />
          {role.name}
        </label>
      ))}
    </fieldset>
  );
}

/** Union of what the ticked roles grant, declared permissions only, as the api combines them. */
export function combinedPermissions(
  roles: ReadonlyArray<AccessRole>,
  roleIds: ReadonlySet<string>,
): ReadonlyArray<PermissionDeclaration> {
  const byKey = new Map<string, PermissionDeclaration>();
  for (const role of roles) {
    if (!roleIds.has(role.id)) continue;
    for (const permission of role.permissions) byKey.set(permission.key, permission);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Permissions in plain words: name, one-sentence description and the feature (AC-12). */
export function PermissionList({
  permissions,
}: {
  permissions: ReadonlyArray<PermissionDeclaration>;
}) {
  if (permissions.length === 0) {
    return <p className="text-muted-foreground">No permissions.</p>;
  }
  return (
    <ul className="grid gap-2">
      {permissions.map((permission) => (
        <li key={permission.key}>
          <span className="font-medium">{permission.name}</span>{' '}
          <span className="text-muted-foreground">· {permission.feature}</span>
          <p className="text-muted-foreground">{permission.description}</p>
        </li>
      ))}
    </ul>
  );
}
