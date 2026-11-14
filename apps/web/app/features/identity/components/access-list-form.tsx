import type { AccessRole, PermissionDeclaration } from '@arv/contracts/identity';
import { CheckIcon, CircleAlertIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useId } from 'react';
import { useFetcher } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { Alert } from '~/shared/ui/alert';
import { Checkbox } from '~/shared/ui/checkbox';
import { Input } from '~/shared/ui/input';

/**
 * What the access-list action answers each dialog: done, or the message to show. `field` names
 * the input the message belongs under; without it the message shows as an alert.
 */
export type AccessListActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string; readonly field?: FormField };

export type FormField = 'email' | 'name';

/** The `intent` field each access-list form posts, so one action serves every dialog. */
export const Intent = {
  add: 'add',
  rename: 'rename',
  remove: 'remove',
  setRoles: 'set-roles',
} as const;
export type Intent = (typeof Intent)[keyof typeof Intent];

/** A form's error: under its field when it names one, otherwise as an alert. */
export type FormFailure = { readonly error: string; readonly field?: FormField } | null;

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
  const failure: FormFailure =
    result && !result.ok ? { error: result.error, field: result.field } : null;
  return {
    fetcher,
    submitting: fetcher.state !== 'idle',
    failure,
    /** The message for `field`, if the failure belongs under it. */
    fieldError: (field: FormField) => (failure?.field === field ? failure.error : null),
    /** The message to show as an alert: a failure that names no field. */
    alertError: failure && !failure.field ? failure.error : null,
  };
}

/** A labelled text input with an optional hint, replaced by the error when there is one. */
export function Field({
  label,
  hint,
  error,
  className,
  ...props
}: { label: string; hint?: ReactNode; error?: string | null } & ComponentProps<typeof Input>) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <Input
        id={id}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        {...props}
      />
      {error ? (
        <p id={messageId} role="alert" className="text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A refusal that belongs to no single field, shown where the admin acted (AC-14). */
export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <p>{error}</p>
    </Alert>
  );
}

/** A ticked box with its label and an optional second line, the design's checkbox row. */
export function CheckboxRow({
  name,
  value,
  checked,
  onCheckedChange,
  label,
  description,
  labelClassName,
}: {
  name: string;
  value: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  labelClassName?: string;
}) {
  const id = useId();
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox inside is the control
    <label className="flex cursor-pointer items-start gap-3">
      <Checkbox
        name={name}
        value={value}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={`${id}-label`} className={labelClassName}>
          {label}
        </span>
        {description ? (
          <span id={`${id}-description`} className="text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** Ticks for the access roles to hold; posted as repeated `accessRoleId` fields. */
export function AccessRoleChoices({
  roles,
  isChecked,
  onToggle,
  showPreselected = false,
}: {
  roles: ReadonlyArray<AccessRole>;
  isChecked: (roleId: string) => boolean;
  onToggle: (roleId: string, checked: boolean) => void;
  /** Note the pre-selected role under its name (the «Add user» dialog). */
  showPreselected?: boolean;
}) {
  if (roles.length === 0) {
    return <p className="text-muted-foreground">No access roles yet.</p>;
  }
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-2 font-medium">Access roles</legend>
      <div className="flex flex-col gap-3">
        {roles.map((role) => (
          <CheckboxRow
            key={role.id}
            name="accessRoleId"
            value={role.id}
            checked={isChecked(role.id)}
            onCheckedChange={(checked) => onToggle(role.id, checked)}
            label={role.name}
            description={
              showPreselected && role.isPreselected ? (
                <span className="text-xs">Pre-selected for new users</span>
              ) : undefined
            }
          />
        ))}
      </div>
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

/** Permissions grouped by feature, features in name order, keeping each group's order. */
function groupByFeature(permissions: ReadonlyArray<PermissionDeclaration>) {
  const groups = new Map<string, PermissionDeclaration[]>();
  for (const permission of permissions) {
    groups.set(permission.feature, [...(groups.get(permission.feature) ?? []), permission]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * «What they can do»: what the ticked roles allow together, in plain words grouped by feature
 * (AC-12). Updates as boxes are ticked.
 */
export function WhatTheyCanDo({
  permissions,
}: {
  permissions: ReadonlyArray<PermissionDeclaration>;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h3 id={titleId} className="font-medium">
        What they can do
      </h3>
      {permissions.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing. They can sign in but see no data. Tick a role to grant permissions.
        </p>
      ) : (
        groupByFeature(permissions).map(([feature, items]) => (
          <div key={feature} className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">{feature}</p>
            <ul className="flex flex-col gap-1">
              {items.map((permission) => (
                <li key={permission.key} className="flex items-start gap-2">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{permission.name}.</span> {permission.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
