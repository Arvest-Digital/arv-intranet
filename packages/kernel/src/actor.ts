import { Context, Data } from 'effect';
import type { UserId } from './ids';
import type { Permission } from './permission';

/**
 * Who is making the current request. Built once per request by the identity module.
 * `permissions` is resolved at request time; an empty set denies everything.
 */
export type Actor = Data.TaggedEnum<{
  Anonymous: Record<never, never>;
  User: { readonly id: UserId; readonly permissions: ReadonlySet<Permission> };
}>;
export const Actor = Data.taggedEnum<Actor>();

export class CurrentActor extends Context.Tag('@arv/kernel/CurrentActor')<CurrentActor, Actor>() {}
