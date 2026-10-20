import { Context, type Effect, Schema } from 'effect';

/**
 * Fields every domain event carries. Events extend it, e.g.
 * `Schema.TaggedClass<RequestApproved>()('RequestApproved', { ...DomainEvent.fields, requestId })`.
 */
export const DomainEvent = Schema.Struct({
  eventId: Schema.UUID,
  occurredAt: Schema.DateFromString,
});
export type DomainEvent = typeof DomainEvent.Type & { readonly _tag: string };

/** Records an event in the outbox. Call inside `UnitOfWork.transactional` with the state change. */
export class DomainEvents extends Context.Tag('@arv/kernel/DomainEvents')<
  DomainEvents,
  { readonly record: (event: DomainEvent) => Effect.Effect<void> }
>() {}

/** Runs the wrapped effect in one database transaction: it commits or rolls back as a whole. */
export class UnitOfWork extends Context.Tag('@arv/kernel/UnitOfWork')<
  UnitOfWork,
  { readonly transactional: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> }
>() {}
