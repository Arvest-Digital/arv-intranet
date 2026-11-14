import type { Me } from '@arv/contracts/identity';
import { isRouteErrorResponse } from 'react-router';

/** The permission that shows «Access» in the navigation and opens the admin screens (AC-08). */
export const MANAGE_ACCESS = 'identity:manage-access';

export const canManageAccess = (me: Me) => me.permissions.includes(MANAGE_ACCESS);

/**
 * Why a page was refused, carried as the body of a thrown `data()` response so the root error
 * boundary can show the right screen: removed from the access list (401, AC-07) or missing the
 * permission a page needs (403, AC-08).
 */
export type Refusal =
  | { readonly reason: 'access-removed' }
  | { readonly reason: 'missing-permission' };

export const ACCESS_REMOVED: Refusal = { reason: 'access-removed' };
export const MISSING_PERMISSION: Refusal = { reason: 'missing-permission' };

/** The refusal an error boundary received, or null for any other error. */
export function refusalOf(error: unknown): Refusal['reason'] | null {
  if (!isRouteErrorResponse(error)) return null;
  const reason = (error.data as Partial<Refusal> | null)?.reason;
  return reason === 'access-removed' || reason === 'missing-permission' ? reason : null;
}
