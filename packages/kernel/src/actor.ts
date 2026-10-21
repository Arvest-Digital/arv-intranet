import { Context, Data } from 'effect';
import type { UserId } from './ids';

/** Who is making the current request. Built once per request by the identity module. */
export type Actor = Data.TaggedEnum<{
  Anonymous: Record<never, never>;
  User: { readonly id: UserId };
}>;
export const Actor = Data.taggedEnum<Actor>();

export class CurrentActor extends Context.Tag('@arv/kernel/CurrentActor')<CurrentActor, Actor>() {}
