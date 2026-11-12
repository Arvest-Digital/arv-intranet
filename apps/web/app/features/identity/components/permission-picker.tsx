import type { PermissionDeclaration } from '@arv/contracts/identity';
import { TriangleAlertIcon } from 'lucide-react';

/** The catalog grouped by feature, features and permissions in name order. */
export function byFeature(
  catalog: ReadonlyArray<PermissionDeclaration>,
): ReadonlyArray<readonly [feature: string, ReadonlyArray<PermissionDeclaration>]> {
  const groups = new Map<string, PermissionDeclaration[]>();
  for (const permission of catalog) {
    const group = groups.get(permission.feature) ?? [];
    group.push(permission);
    groups.set(permission.feature, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([feature, items]) => [feature, items.sort((a, b) => a.name.localeCompare(b.name))]);
}

/**
 * Ticks for a role's permissions, posted as repeated `permissionKey` fields. Only declared
 * permissions are offered, each with its name and one-sentence description, grouped by feature
 * (AC-09). Retired keys the role still grants are listed apart, flagged and removable; once
 * unticked and saved they are gone, as no module offers them any more (AC-16).
 */
export function PermissionPicker({
  catalog,
  retiredKeys,
  isChecked,
  onToggle,
}: {
  catalog: ReadonlyArray<PermissionDeclaration>;
  retiredKeys: ReadonlyArray<string>;
  isChecked: (key: string) => boolean;
  onToggle: (key: string, checked: boolean) => void;
}) {
  return (
    <div className="grid gap-4">
      {catalog.length === 0 ? (
        <p className="text-muted-foreground">No feature declares a permission yet.</p>
      ) : (
        byFeature(catalog).map(([feature, permissions]) => (
          <fieldset key={feature} className="grid gap-2">
            <legend className="mb-2 font-medium">{feature}</legend>
            {permissions.map((permission) => (
              <label key={permission.key} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="permissionKey"
                  value={permission.key}
                  checked={isChecked(permission.key)}
                  onChange={(event) => onToggle(permission.key, event.currentTarget.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="font-medium">{permission.name}</span>
                  <span className="block text-muted-foreground">{permission.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ))
      )}
      {retiredKeys.length > 0 ? (
        <fieldset className="grid gap-2 rounded-md border border-border p-3">
          <legend className="flex items-center gap-1.5 px-1 font-medium text-destructive">
            <TriangleAlertIcon aria-hidden="true" className="size-4" />
            Retired permissions
          </legend>
          <p className="text-muted-foreground">
            No feature declares these any more, so they grant nothing. Untick to remove them; they
            cannot be added back.
          </p>
          {retiredKeys.map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="permissionKey"
                value={key}
                checked={isChecked(key)}
                onChange={(event) => onToggle(key, event.currentTarget.checked)}
                className="size-4 accent-primary"
              />
              <code className="font-mono text-xs">{key}</code>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
