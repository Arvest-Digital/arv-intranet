import type { PermissionDeclaration } from '@arv/contracts/identity';
import { TriangleAlertIcon } from 'lucide-react';
import { Button } from '~/shared/ui/button';
import { CheckboxRow } from './access-list-form';

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

const groupClass = 'flex flex-col rounded-lg border border-border';
const rowClass = 'border-b border-border px-4 py-3 last:border-b-0';

/**
 * Ticks for a role's permissions, posted as repeated `permissionKey` fields. Only declared
 * permissions are offered, each with its name and one-sentence description, grouped by feature
 * (AC-09). Retired keys the role still grants are listed apart, flagged and removable; once
 * removed and saved they are gone, as no module offers them any more (AC-16).
 */
export function PermissionPicker({
  catalog,
  retiredKeys,
  isChecked,
  onToggle,
}: {
  catalog: ReadonlyArray<PermissionDeclaration>;
  /** Retired keys still on the role; each is posted until removed. */
  retiredKeys: ReadonlyArray<string>;
  isChecked: (key: string) => boolean;
  onToggle: (key: string, checked: boolean) => void;
}) {
  const kept = retiredKeys.filter(isChecked);
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-4 text-base font-medium">Permissions</legend>
      {catalog.length === 0 ? (
        <p className="text-muted-foreground">No feature declares a permission yet.</p>
      ) : (
        byFeature(catalog).map(([feature, permissions]) => (
          // biome-ignore lint/a11y/useSemanticElements: a nested fieldset would add a second legend
          <div key={feature} role="group" aria-label={feature} className={groupClass}>
            <div className={`${rowClass} font-medium`}>{feature}</div>
            {permissions.map((permission) => (
              <div key={permission.key} className={rowClass}>
                <CheckboxRow
                  name="permissionKey"
                  value={permission.key}
                  checked={isChecked(permission.key)}
                  onCheckedChange={(checked) => onToggle(permission.key, checked)}
                  label={permission.name}
                  labelClassName="font-medium"
                  description={permission.description}
                />
              </div>
            ))}
          </div>
        ))
      )}
      {kept.length > 0 ? (
        // biome-ignore lint/a11y/useSemanticElements: a nested fieldset would add a second legend
        <div role="group" aria-label="Retired permissions" className={groupClass}>
          <div className={`${rowClass} font-medium`}>Retired permissions</div>
          {kept.map((key) => (
            <div key={key} role="status" className={`${rowClass} flex flex-wrap items-start gap-3`}>
              <input type="hidden" name="permissionKey" value={key} />
              <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p className="min-w-[200px] flex-1">
                <span className="font-medium">Retired.</span> No longer declared by any feature:{' '}
                <code className="font-mono text-[13px]">{key}</code>. It grants nothing.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Remove ${key}`}
                onClick={() => onToggle(key, false)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
