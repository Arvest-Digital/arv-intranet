import type { PermissionDeclaration } from '@arv/kernel';
import { Effect } from 'effect';
import { splitGrants } from '../../domain/access-role';
import { type AccessRoleId, type AccessRoleRecord, PermissionCatalog } from '../ports';

/** An access role as admins see it: granted keys split against the catalog (AC-16). */
export interface AccessRoleView {
  readonly id: AccessRoleId;
  readonly name: string;
  /** Ticked by default when adding someone (AC-13). */
  readonly isPreselected: boolean;
  /** Users holding it; with `isPreselected`, the delete warning (AC-11). */
  readonly holderCount: number;
  /** Granted keys a module declares now, in plain words. */
  readonly permissions: ReadonlyArray<PermissionDeclaration>;
  /** Granted keys no module declares; non-empty = flagged. They grant nothing (AC-16). */
  readonly retiredPermissionKeys: ReadonlyArray<string>;
  readonly createdAt: Date;
}

/** Labels `record`'s keys with the current catalog, so a re-declared key loses its flag. */
export const toAccessRoleView = (record: AccessRoleRecord) =>
  Effect.map(PermissionCatalog, (catalog): AccessRoleView => {
    const declarations = new Map(catalog.declarations().map((d) => [d.key as string, d]));
    const { active, retired } = splitGrants(record.permissionKeys, new Set(declarations.keys()));
    return {
      id: record.id,
      name: record.name,
      isPreselected: record.isPreselected,
      holderCount: record.holderCount,
      permissions: active.flatMap((key) => declarations.get(key) ?? []),
      retiredPermissionKeys: retired,
      createdAt: record.createdAt,
    };
  });
