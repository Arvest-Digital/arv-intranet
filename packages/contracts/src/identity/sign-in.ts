import { Schema } from 'effect';
import { Email, PermissionKey, strict, UniqueArray, UserName } from './values';

/** PKCE verifier (RFC 7636). */
export const CodeVerifier = Schema.String.pipe(
  Schema.minLength(43),
  Schema.maxLength(128),
  Schema.pattern(/^[A-Za-z0-9._~-]+$/),
);

/** An absolute http(s) URL kept as a string (OpenAPI `format: uri`). */
const AbsoluteUrl = Schema.String.pipe(
  Schema.pattern(/^https?:\/\/[^\s/?#]+[^\s]*$/, { message: () => 'Invalid URL' }),
);

/** `beginSignIn` 200: Google's address, the anti-forgery state and the PKCE verifier. */
export const SignInRedirect = Schema.Struct({
  authorizationUrl: AbsoluteUrl,
  state: Schema.NonEmptyString,
  codeVerifier: CodeVerifier,
});
export type SignInRedirect = typeof SignInRedirect.Type;

/** `completeSignIn` request body: Google's one-time code and the verifier web kept. */
export const SignInCompletion = strict(
  Schema.Struct({
    code: Schema.NonEmptyString,
    codeVerifier: CodeVerifier,
  }),
);
export type SignInCompletion = typeof SignInCompletion.Type;

/**
 * `completeSignIn` 200 (signed in): the raw session token, returned once, and its absolute expiry
 * (sign-in + 7 days, AC-20). The refusals (`identity.sign_in_refused`, `identity.not_on_access_list`)
 * travel as `ApiErrorBody`; see `errors.ts`.
 */
export const Session = Schema.Struct({
  /** 256 random bits, base64url. */
  sessionToken: Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_-]{43}$/)),
  expiresAt: Schema.Date,
});
export type Session = typeof Session.Type;
export type SessionEncoded = typeof Session.Encoded;

/** `getMe` 200: who is signed in and the declared permissions they hold now. */
export const Me = Schema.Struct({
  id: Schema.UUID,
  email: Email,
  name: UserName,
  permissions: UniqueArray(PermissionKey),
});
export type Me = typeof Me.Type;
