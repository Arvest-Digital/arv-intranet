import { Schema } from 'effect';

/** Machine-readable reason of a failure, `module.error_name` (e.g. `identity.last_admin_required`). */
export const ErrorCode = Schema.String.pipe(Schema.pattern(/^[a-z_]+\.[a-z_]+$/));

/** Extra, code-specific data of a failure (e.g. `{ missingPermissions: [...] }`). */
export const ErrorDetails = Schema.Record({ key: Schema.String, value: Schema.Unknown });

export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
  resource: Schema.String,
  id: Schema.String,
  /** Defaults to `platform.not_found`. */
  code: Schema.optional(ErrorCode),
}) {
  override get message() {
    return `${this.resource} ${this.id} not found`;
  }
}

/**
 * 409: the request breaks a module rule against current state. For a concurrent edit (e.g.
 * `scheduling.version_conflict`) `details` carries the current values and who changed them last.
 */
export class Conflict extends Schema.TaggedError<Conflict>()('Conflict', {
  message: Schema.String,
  /** Every conflict is a module rule, so the presenter always names it (no `platform.` default). */
  code: ErrorCode,
  details: Schema.optional(ErrorDetails),
}) {}

/**
 * 409: the save has consequences the user must confirm first (ADR-0010); nothing was saved.
 * `details` is the impact list (e.g. overbooked weeks). The client re-sends the same request with
 * `confirm: true` and the server recomputes the impact on fresh data. Like `Conflict`, the presenter
 * always names the code (e.g. `scheduling.overbooking_confirmation_required`).
 */
export class ConfirmationRequired extends Schema.TaggedError<ConfirmationRequired>()(
  'ConfirmationRequired',
  {
    message: Schema.String,
    code: ErrorCode,
    details: ErrorDetails,
  },
) {}

/**
 * 401: no signed-in actor. `reason: 'access-removed'` when the session ended because the user was
 * removed from the access list. Produced by `runEffect` from the kernel's `Unauthenticated`.
 */
export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()('Unauthenticated', {
  reason: Schema.optional(Schema.Literal('access-removed')),
}) {
  override get message() {
    return this.reason === 'access-removed'
      ? 'You no longer have access to the intranet'
      : 'Sign in to continue';
  }
}

/**
 * 403: the actor is signed in but lacks `permission` (`<module>:<action>`). Produced by `runEffect`
 * from the kernel's `PermissionDenied`.
 */
export class Forbidden extends Schema.TaggedError<Forbidden>()('Forbidden', {
  permission: Schema.String,
}) {
  override get message() {
    return `You lack the permission ${this.permission}`;
  }
}

/**
 * 403 for a module rule other than a missing permission (e.g. `identity.sign_in_refused`). Like
 * `Conflict`, the presenter always names the code and the message; the wire `_tag` is `Forbidden`.
 */
export class Refused extends Schema.TaggedError<Refused>()('Refused', {
  message: Schema.String,
  code: ErrorCode,
  details: Schema.optional(ErrorDetails),
}) {}

/**
 * 400 for a module rule the input breaks beyond schema validation (e.g.
 * `identity.email_not_company_domain`). Like `Conflict`, the presenter always names the code and
 * the message; the wire `_tag` is `ValidationError`.
 */
export class Invalid extends Schema.TaggedError<Invalid>()('Invalid', {
  message: Schema.String,
  code: ErrorCode,
  details: Schema.optional(ErrorDetails),
}) {}

/** HTTP kind of failure: the `_tag` of every error body. */
export const ApiErrorTag = Schema.Literal(
  'ValidationError',
  'Unauthenticated',
  'Forbidden',
  'NotFound',
  'Conflict',
  'ConfirmationRequired',
  'InternalError',
);
export type ApiErrorTag = typeof ApiErrorTag.Type;

/** Body of every non-2xx JSON response from the API (OpenAPI `ApiErrorBody`). */
export const ApiErrorBody = Schema.Struct({
  error: Schema.Struct({
    _tag: ApiErrorTag,
    code: ErrorCode,
    message: Schema.String,
    details: Schema.optional(ErrorDetails),
  }),
});
export type ApiErrorBody = typeof ApiErrorBody.Type;
