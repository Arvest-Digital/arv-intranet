import { UserId } from '@arv/kernel';
import { Schema } from 'effect';

export class User extends Schema.Class<User>('User')({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  createdAt: Schema.DateFromSelf,
}) {}

/** What a new user is created from; the database assigns `id` and `createdAt`. */
export type NewUser = { readonly email: string; readonly name: string };
