import { Schema } from 'effect';

const Email = Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: () => 'Invalid email address' }),
  Schema.maxLength(254),
);

/** A user as returned by the API. `createdAt` travels over the wire as an ISO string. */
export const User = Schema.Struct({
  id: Schema.UUID,
  email: Email,
  name: Schema.String,
  createdAt: Schema.DateFromString,
});
export type User = typeof User.Type;
export type UserEncoded = typeof User.Encoded;

export const CreateUserInput = Schema.Struct({
  email: Email,
  name: Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(100)),
});
export type CreateUserInput = typeof CreateUserInput.Type;

export const UserIdParam = Schema.Struct({
  id: Schema.UUID,
});
