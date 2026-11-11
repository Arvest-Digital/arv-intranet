import { Schema } from 'effect';

const Email = Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: () => 'Invalid email address' }),
  Schema.maxLength(254),
);

/**
 * The scaffold user shape the web's user list still renders; T25 moves it to `UserWithAccessRoles`.
 * A user as returned by the API. `createdAt` travels over the wire as an ISO string. */
export const User = Schema.Struct({
  id: Schema.UUID,
  email: Email,
  name: Schema.String,
  createdAt: Schema.DateFromString,
});
export type User = typeof User.Type;
export type UserEncoded = typeof User.Encoded;
