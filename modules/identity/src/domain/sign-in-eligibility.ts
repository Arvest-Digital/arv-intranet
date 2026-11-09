import { Data } from 'effect';

/**
 * The ID-token claims sign-in eligibility looks at. Every field is `unknown`: the claims come
 * from outside the trust boundary, so nothing is assumed about their presence or type.
 * Issuer, audience, expiry and signature are checked by the Google sign-in adapter, not here.
 */
export type SignInClaims = {
  readonly email?: unknown;
  readonly email_verified?: unknown;
  readonly hd?: unknown;
  readonly name?: unknown;
};

/**
 * `Refused` carries nothing about the person or the claims on purpose (sad §8 Logging, AC-02):
 * a refused attempt must leave no trace of who tried.
 */
export type SignInEligibility = Data.TaggedEnum<{
  Eligible: { readonly email: string; readonly name: string };
  Refused: Record<never, never>;
}>;

export const SignInEligibility = Data.taggedEnum<SignInEligibility>();

// TODO(identity): reuse the CompanyEmail normaliser from user.ts once it lands.
const normalise = (value: string): string => value.trim().toLowerCase();

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/**
 * Fail closed: a missing or malformed claim refuses. Eligible only when Google says the email is
 * verified, the hosted domain (`hd`) is the company domain, and the email itself is on that domain.
 */
export const signInEligibility = (
  claims: SignInClaims,
  companyDomain: string,
): SignInEligibility => {
  const refused = SignInEligibility.Refused();
  const domain = normalise(companyDomain);
  if (domain === '') return refused;

  if (claims.email_verified !== true) return refused;

  const hd = nonEmptyString(claims.hd);
  if (hd === undefined || normalise(hd) !== domain) return refused;

  const rawEmail = nonEmptyString(claims.email);
  if (rawEmail === undefined) return refused;
  const email = normalise(rawEmail);
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@') || email.slice(at + 1) !== domain) return refused;

  const name = nonEmptyString(claims.name);
  if (name === undefined) return refused;

  return SignInEligibility.Eligible({ email, name: name.trim() });
};
