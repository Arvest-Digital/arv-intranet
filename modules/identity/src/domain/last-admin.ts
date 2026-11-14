import { Effect } from 'effect';
import { LastAdminRequired } from './errors';

// TODO(identity): reuse the CompanyEmail normaliser from user.ts once it lands.
const normalise = (value: string): string => value.trim().toLowerCase();

/**
 * AC-15: the configured first-admin address is special only while nobody holds manage access.
 * An empty configuration never matches.
 */
export const isFirstAdmin = (
  email: string,
  configuredFirstAdmin: string,
  adminExists: boolean,
): boolean => {
  if (adminExists) return false;
  const configured = normalise(configuredFirstAdmin);
  return configured !== '' && normalise(email) === configured;
};

/**
 * AC-14: run after a change has been applied inside the transaction; failing rolls it back.
 * `holderCount` is the number of users still holding manage access through a declared grant.
 */
export const assertAdminRemains = (holderCount: number): Effect.Effect<void, LastAdminRequired> =>
  holderCount > 0 ? Effect.void : Effect.fail(new LastAdminRequired());
