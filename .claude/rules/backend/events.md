---
paths:
  - "modules/*/src/domain/events.ts"
  - "modules/*/src/events/**"
  - "packages/platform/src/events/**"
---
# Domain events

- Not built yet: only the `DomainEvents` and `UnitOfWork` ports exist in `@arv/kernel`. Ask before adding the outbox, relay or Queue consumer (see `ARCHITECTURE.md` → Cross-module communication).
- Events are Effect Schemas that extend kernel `DomainEvent`, named in past tense (`RequestApproved`). They are public contracts: only additive changes; a breaking change is a new event version.
- Record events with `DomainEvents.record` inside the same `UnitOfWork.transactional` as the state change.
- Handlers must be idempotent (inbox dedupe by event ID) and must not call the publisher synchronously.
- Delivery is at-least-once and can be delayed; never rely on order across event types.
